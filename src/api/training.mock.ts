import { ApiError } from '@/api/api-error';
import {
  delay,
  loadQuizAttempts,
  loadTrainingCompletions,
  saveQuizAttempts,
  saveTrainingCompletions,
  type StoredQuizAttempt,
  type StoredTrainingCompletion,
} from '@/api/mock-store';
import { DemoTrainingCourses, type SeedCourse } from '@/api/training.demo';
import type { TrainingAdapter } from '@/api/training.types';
import { isPassingScore, quizScore } from '@/lib/training';
import type {
  QuizAttempt,
  QuizQuestion,
  QuizQuestionResult,
  TrainingCompletion,
  TrainingCourse,
} from '@/types';

/**
 * 로컬 Mock 교육 저장소.
 *
 * Supabase 쪽에서 course_quiz() 와 submit_quiz() 가 하는 일을 여기서 그대로 한다.
 * 특히 네 가지 규칙은 양쪽 구현이 같은 답을 내야 한다.
 *   - 문항을 내려 줄 때 정답과 해설은 빼고 보낸다
 *   - 고르지 않은 문항은 틀린 것으로 센다
 *   - 점수는 맞힌 비율을 반올림한 0~100 이고, 합격선은 과정마다 다르다
 *   - 응시는 몇 번이든 쌓이지만 수료는 과정당 한 줄이며 날짜는 처음 합격한 날이다
 *
 * 정답이 기기 안에 함께 들어 있는 것은 Mock 의 한계다. 그래도 채점만은 화면이 아니라
 * 이 어댑터가 한다 — 앱이 "맞혔습니다"를 보내는 창구를 두지 않는 것이 계약이기 때문이다.
 */

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 최근에 푼 응시가 위로 오도록 정렬한다 */
function byNewest(a: { createdAt: string }, b: { createdAt: string }): number {
  return b.createdAt.localeCompare(a.createdAt);
}

function findCourse(courseId: string): SeedCourse {
  const course = DemoTrainingCourses.find((item) => item.id === courseId);

  if (!course) {
    throw new ApiError('not_found', '교육 과정을 찾지 못했습니다. 목록을 새로 불러와 주세요.');
  }

  return course;
}

/** 목록에는 교육 내용과 문항을 담지 않는다 */
function toCourse(course: SeedCourse): TrainingCourse {
  const { lessons: _lessons, questions: _questions, ...rest } = course;
  return rest;
}

/** 화면으로 나가는 문항에는 정답과 해설이 없다 */
function toQuestion(question: SeedCourse['questions'][number]): QuizQuestion {
  return {
    id: question.id,
    order: question.order,
    question: question.question,
    choices: question.choices,
  };
}

function toAttempt(stored: StoredQuizAttempt): QuizAttempt {
  const { caregiverId: _caregiverId, ...attempt } = stored;
  return attempt;
}

function toCompletion(stored: StoredTrainingCompletion): TrainingCompletion {
  const { caregiverId: _caregiverId, ...completion } = stored;
  return completion;
}

export const mockTrainingAdapter: TrainingAdapter = {
  async listCourses() {
    await delay();
    return DemoTrainingCourses.map(toCourse);
  },

  async getCourse(courseId) {
    await delay();
    const { questions: _questions, ...detail } = findCourse(courseId);
    return detail;
  },

  async listQuestions(courseId) {
    await delay();
    return findCourse(courseId).questions.map(toQuestion);
  },

  async listAttempts(caregiverId) {
    await delay();
    const attempts = await loadQuizAttempts();

    return attempts
      .filter((attempt) => attempt.caregiverId === caregiverId)
      .sort(byNewest)
      .map(toAttempt);
  },

  async listCompletions(caregiverId) {
    await delay();
    const completions = await loadTrainingCompletions();

    return completions
      .filter((completion) => completion.caregiverId === caregiverId)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
      .map(toCompletion);
  },

  async submitQuiz(courseId, caregiverId, answers) {
    await delay();

    const course = findCourse(courseId);

    if (course.questions.length === 0) {
      throw new ApiError('invalid_state', '이 과정에는 아직 퀴즈가 없습니다.');
    }

    // 답은 문항 기준으로 본다. 앱이 보낸 순서나 개수를 믿지 않는다 —
    // 없는 문항의 답이 섞여 있어도 채점은 이 과정의 문항만으로 한다.
    const results: QuizQuestionResult[] = course.questions.map((question) => {
      const selected = answers.find((answer) => answer.questionId === question.id);

      return {
        questionId: question.id,
        // 고르지 않고 낸 문항은 틀린 것으로 센다
        ...(selected ? { selectedIndex: selected.choiceIndex } : {}),
        answerIndex: question.answerIndex,
        isCorrect: selected?.choiceIndex === question.answerIndex,
        explanation: question.explanation,
      };
    });

    const correctCount = results.filter((result) => result.isCorrect).length;
    const score = quizScore(correctCount, course.questions.length);
    const now = new Date().toISOString();

    const attempt: StoredQuizAttempt = {
      id: createId('attempt'),
      caregiverId,
      courseId,
      correctCount,
      questionCount: course.questions.length,
      score,
      passed: isPassingScore(score, course.passScore),
      createdAt: now,
    };

    await saveQuizAttempts([...(await loadQuizAttempts()), attempt]);

    const completions = await loadTrainingCompletions();
    const existing = completions.find(
      (completion) => completion.caregiverId === caregiverId && completion.courseId === courseId
    );

    // 이미 수료한 과정은 다시 붙어도 날짜를 밀지 않는다
    if (!attempt.passed || existing) {
      return {
        attempt: toAttempt(attempt),
        results,
        isNewCompletion: false,
        ...(existing ? { completedAt: existing.completedAt } : {}),
      };
    }

    const completion: StoredTrainingCompletion = {
      id: createId('completion'),
      caregiverId,
      courseId,
      attemptId: attempt.id,
      completedAt: now,
    };

    await saveTrainingCompletions([...completions, completion]);

    return {
      attempt: toAttempt(attempt),
      results,
      isNewCompletion: true,
      completedAt: completion.completedAt,
    };
  },
};
