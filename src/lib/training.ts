import type { QuizAttempt, TrainingCompletion, TrainingCourse } from '@/types';

/**
 * 교육 진행 상황을 읽는 규칙.
 *
 * 채점 자체는 저장소가 한다(Supabase 는 submit_quiz(), Mock 은 training.mock.ts).
 * 여기 있는 것은 그 결과를 화면에서 다시 세지 않고 같은 문장으로 읽기 위한 함수들이다.
 * 점수 계산식만은 예외로 여기 두는데, Mock 채점이 Supabase 와 같은 값을 내야 하기 때문이다.
 */

/**
 * 맞힌 문항 수를 0~100 점으로.
 *
 * Supabase 의 round(correct * 100.0 / total) 와 같은 값이 나와야 한다.
 * 양수만 다루므로 Postgres 의 round(numeric)(반올림)과 Math.round 의 결과가 같다.
 */
export function quizScore(correctCount: number, questionCount: number): number {
  return questionCount === 0 ? 0 : Math.round((correctCount * 100) / questionCount);
}

/** 합격 기준은 과정마다 다르다. 비교를 한 곳에 모아 두어 화면과 채점이 갈라지지 않게 한다. */
export function isPassingScore(score: number, passScore: number): boolean {
  return score >= passScore;
}

export function completionOf(
  completions: TrainingCompletion[],
  courseId: string
): TrainingCompletion | undefined {
  return completions.find((completion) => completion.courseId === courseId);
}

/** 이 과정을 마지막으로 푼 기록. 목록은 최근 순으로 들어온다. */
export function latestAttemptOf(
  attempts: QuizAttempt[],
  courseId: string
): QuizAttempt | undefined {
  return attempts.find((attempt) => attempt.courseId === courseId);
}

/** 지금까지의 최고 점수. 한 번도 풀지 않았으면 없음 */
export function bestScoreOf(attempts: QuizAttempt[], courseId: string): number | undefined {
  const scores = attempts
    .filter((attempt) => attempt.courseId === courseId)
    .map((attempt) => attempt.score);

  return scores.length > 0 ? Math.max(...scores) : undefined;
}

/**
 * 과정 카드에 붙는 한 줄.
 *
 * 수료했으면 수료했다고만 말하고 점수는 말하지 않는다 — 붙고 나면 몇 점이었는지는
 * 더 이상 할 일을 알려 주지 않는다. 아직이면 지금까지의 최고 점수와 합격선을 함께 보여 준다.
 */
export function courseProgressLabel(
  course: TrainingCourse,
  completion: TrainingCompletion | undefined,
  attempts: QuizAttempt[]
): string {
  if (completion) {
    return '수료했습니다';
  }

  const best = bestScoreOf(attempts, course.id);

  if (best === undefined) {
    return `약 ${course.estimatedMinutes}분 · 퀴즈 ${course.questionCount}문항`;
  }

  return `최고 ${best}점 · ${course.passScore}점 이상이면 수료`;
}
