import type {
  QuizAnswer,
  QuizAttempt,
  QuizGrade,
  QuizQuestion,
  TrainingCompletion,
  TrainingCourse,
  TrainingCourseDetail,
} from '@/types';

/**
 * 교육 어댑터의 계약.
 *
 * 화면과 저장소는 이 타입에만 의존한다.
 * 구현은 로컬 Mock(training.mock.ts)과 Supabase(training.supabase.ts) 두 가지다.
 *
 * 두 가지가 이 계약의 핵심이다.
 *   - 정답은 앱으로 내려오지 않는다. listQuestions() 가 돌려주는 문항에는 보기만 있다.
 *   - 채점과 수료 판정은 저장소가 한다. 앱이 "맞혔습니다"를 보내는 창구는 없다.
 *
 * Mock 모드에서는 정답이 기기 안에 함께 들어 있다. 정답을 감출 수 없는 것은 Mock 의
 * 한계이지 계약의 예외가 아니다 — 두 구현 모두 앱이 보낸 답만 받고 점수는 스스로 매긴다.
 */
export type TrainingAdapter = {
  /** 공개된 교육 과정 목록. 교육 내용과 문항은 담기지 않는다. */
  listCourses: () => Promise<TrainingCourse[]>;
  /** 과정 하나와 그 교육 내용 */
  getCourse: (courseId: string) => Promise<TrainingCourseDetail>;
  /** 퀴즈 문항. 정답은 들어 있지 않다. */
  listQuestions: (courseId: string) => Promise<QuizQuestion[]>;
  /** 내 응시 기록. 최근에 푼 순서로 돌려준다. */
  listAttempts: (caregiverId: string) => Promise<QuizAttempt[]>;
  /** 내 수료 기록 */
  listCompletions: (caregiverId: string) => Promise<TrainingCompletion[]>;
  /**
   * 퀴즈를 내고 채점받는다.
   *
   * 고르지 않은 문항은 틀린 것으로 센다. 응시는 몇 번이든 할 수 있고 기록이 모두 남지만,
   * 수료는 과정당 한 번만 남으며 날짜는 처음 합격한 날 그대로다.
   */
  submitQuiz: (courseId: string, caregiverId: string, answers: QuizAnswer[]) => Promise<QuizGrade>;
};
