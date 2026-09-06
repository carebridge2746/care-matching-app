import { ApiError } from '@/api/api-error';
import type {
  PublishedCourseRow,
  QuizAnswerInput,
  QuizAttemptRow,
  QuizGradeRow,
  QuizQuestionRow,
  TrainingCompletionRow,
  TrainingLessonRow,
} from '@/api/database.types';
import { getSupabaseClient } from '@/api/supabase-client';
import { toApiError } from '@/api/supabase-error';
import type { TrainingAdapter } from '@/api/training.types';
import type {
  QuizAttempt,
  QuizQuestion,
  QuizQuestionResult,
  TrainingCompletion,
  TrainingCourse,
  TrainingLesson,
} from '@/types';

/**
 * Supabase 교육 어댑터.
 *
 * 창구가 넷이다.
 *   - 과정 목록·상세: public.published_courses 뷰와 training_lessons 표 (공개된 과정만)
 *   - 퀴즈 문항: public.course_quiz() 함수 (정답과 해설을 빼고 내보낸다)
 *   - 내 기록: training_quiz_attempts / training_completions (본인만 읽을 수 있는 정책)
 *   - 제출: public.submit_quiz() 함수 (채점하고, 붙었으면 수료를 만든다)
 *
 * 앱이 점수나 합격 여부를 보내는 창구는 없다. 두 표에 insert 정책을 두지 않아서
 * "수료했습니다"를 직접 적어 넣을 방법 자체가 없다.
 */

const CourseColumns =
  'id, slug, title, summary, certification_label, estimated_minutes, pass_score, display_order, question_count';
const LessonColumns = 'id, course_id, display_order, title, body, key_points, created_at';
const AttemptColumns =
  'id, course_id, caregiver_id, correct_count, question_count, score, passed, created_at';
const CompletionColumns = 'id, course_id, caregiver_id, attempt_id, completed_at';

function toCourse(row: PublishedCourseRow): TrainingCourse {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    ...(row.certification_label ? { certificationLabel: row.certification_label } : {}),
    estimatedMinutes: row.estimated_minutes,
    passScore: row.pass_score,
    questionCount: row.question_count,
  };
}

function toLesson(row: TrainingLessonRow): TrainingLesson {
  return {
    id: row.id,
    order: row.display_order,
    title: row.title,
    body: row.body,
    keyPoints: row.key_points,
  };
}

function toQuestion(row: QuizQuestionRow): QuizQuestion {
  return {
    id: row.id,
    order: row.display_order,
    question: row.question,
    choices: row.choices,
  };
}

function toAttempt(row: QuizAttemptRow): QuizAttempt {
  return {
    id: row.id,
    courseId: row.course_id,
    correctCount: row.correct_count,
    questionCount: row.question_count,
    score: row.score,
    passed: row.passed,
    createdAt: row.created_at,
  };
}

function toCompletion(row: TrainingCompletionRow): TrainingCompletion {
  return {
    id: row.id,
    courseId: row.course_id,
    attemptId: row.attempt_id,
    completedAt: row.completed_at,
  };
}

function toResult(row: QuizGradeRow['results'][number]): QuizQuestionResult {
  return {
    questionId: row.question_id,
    ...(row.selected_index === null ? {} : { selectedIndex: row.selected_index }),
    answerIndex: row.answer_index,
    isCorrect: row.is_correct,
    explanation: row.explanation,
  };
}

export const supabaseTrainingAdapter: TrainingAdapter = {
  async listCourses() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('published_courses')
      .select(CourseColumns)
      .order('display_order', { ascending: true });

    if (error) {
      throw toApiError(error, '교육 과정을 불러오지 못했습니다.');
    }

    return data.map(toCourse);
  },

  async getCourse(courseId) {
    const supabase = getSupabaseClient();

    // 과정과 교육 내용은 서로를 필요로 하지 않으므로 함께 기다린다
    const [courseResult, lessonResult] = await Promise.all([
      supabase.from('published_courses').select(CourseColumns).eq('id', courseId).maybeSingle(),
      supabase
        .from('training_lessons')
        .select(LessonColumns)
        .eq('course_id', courseId)
        .order('display_order', { ascending: true }),
    ]);

    if (courseResult.error) {
      throw toApiError(courseResult.error, '교육 과정을 불러오지 못했습니다.');
    }
    if (lessonResult.error) {
      throw toApiError(lessonResult.error, '교육 내용을 불러오지 못했습니다.');
    }
    // 비공개로 내린 과정도 여기로 온다. 없는 과정과 구분해서 알려 주지 않는다.
    if (!courseResult.data) {
      throw new ApiError('not_found', '교육 과정을 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }

    return { ...toCourse(courseResult.data), lessons: lessonResult.data.map(toLesson) };
  },

  async listQuestions(courseId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('course_quiz', { target_course: courseId });

    if (error) {
      throw toApiError(error, '퀴즈 문항을 불러오지 못했습니다.');
    }

    return data.map(toQuestion);
  },

  // caregiverId 는 쓰지 않는다. 누구의 기록인지는 정책이 직접 본다.
  async listAttempts(_caregiverId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('training_quiz_attempts')
      .select(AttemptColumns)
      .order('created_at', { ascending: false });

    if (error) {
      throw toApiError(error, '응시 기록을 불러오지 못했습니다.');
    }

    return data.map(toAttempt);
  },

  async listCompletions(_caregiverId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('training_completions')
      .select(CompletionColumns)
      .order('completed_at', { ascending: false });

    if (error) {
      throw toApiError(error, '수료 기록을 불러오지 못했습니다.');
    }

    return data.map(toCompletion);
  },

  async submitQuiz(courseId, _caregiverId, answers) {
    const supabase = getSupabaseClient();

    const payload: QuizAnswerInput[] = answers.map((answer) => ({
      question_id: answer.questionId,
      choice_index: answer.choiceIndex,
    }));

    const { data, error } = await supabase.rpc('submit_quiz', {
      target_course: courseId,
      submitted_answers: payload,
    });

    if (error) {
      // 간병인이 아니거나 공개되지 않은 과정이면 함수가 예외를 던진다 (errcode 22023)
      if (error.code === '22023') {
        throw new ApiError('invalid_state', '지금은 이 교육의 퀴즈를 풀 수 없습니다.');
      }
      throw toApiError(error, '퀴즈를 제출하지 못했습니다.');
    }
    if (!data) {
      throw new ApiError('not_found', '교육 과정을 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }

    return {
      attempt: toAttempt(data.attempt),
      results: data.results.map(toResult),
      isNewCompletion: data.is_new_completion,
      ...(data.completed_at ? { completedAt: data.completed_at } : {}),
    };
  },
};
