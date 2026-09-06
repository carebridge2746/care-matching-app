import { create } from 'zustand';

import { toApiErrorMessage } from '@/api/api-error';
import { trainingApi } from '@/api/training';
import type {
  QuizAnswer,
  QuizAttempt,
  QuizGrade,
  QuizQuestion,
  TrainingCompletion,
  TrainingCourse,
  TrainingCourseDetail,
} from '@/types';

type TrainingState = {
  /** 들을 수 있는 교육 과정 */
  courses: TrainingCourse[];
  /** 내 응시 기록. 최근에 푼 순서다. */
  attempts: QuizAttempt[];
  /** 내 수료 기록 */
  completions: TrainingCompletion[];
  isLoading: boolean;
  /** 지금 목록이 누구의 것인지. 다른 사용자가 로그인하면 목록을 먼저 비운다. */
  loadedCaregiverId: string | null;

  /** 지금 열어 둔 과정과 그 퀴즈 문항 */
  course: TrainingCourseDetail | null;
  questions: QuizQuestion[];
  isCourseLoading: boolean;

  /** 방금 낸 퀴즈의 채점 결과. 다른 과정을 열면 비운다. */
  grade: QuizGrade | null;
  isSubmitting: boolean;

  errorMessage: string | null;

  load: (caregiverId: string) => Promise<void>;
  openCourse: (courseId: string) => Promise<void>;
  /** 결과 화면을 닫고 다시 풀 수 있게 한다 */
  clearGrade: () => void;
  submitQuiz: (courseId: string, caregiverId: string, answers: QuizAnswer[]) => Promise<boolean>;
  clearError: () => void;
};

/**
 * 교육 상태.
 *
 * 과정 목록과 내 기록(응시·수료)을 한 저장소에 둔다. 목록의 카드마다
 * "수료했는지, 최고 몇 점인지"를 함께 보여 줘야 해서 늘 같이 쓰이기 때문이다.
 *
 * 점수와 합격 여부는 여기서 계산하지 않는다. 채점은 어댑터가 하고 이 저장소는
 * 받은 결과를 담기만 한다 — 화면에서 다시 세기 시작하면 저장된 기록과 조금씩 어긋난다.
 */
export const useTrainingStore = create<TrainingState>((set, get) => ({
  courses: [],
  attempts: [],
  completions: [],
  isLoading: false,
  loadedCaregiverId: null,

  course: null,
  questions: [],
  isCourseLoading: false,

  grade: null,
  isSubmitting: false,

  errorMessage: null,

  load: async (caregiverId) => {
    const isSameUser = get().loadedCaregiverId === caregiverId;
    set({
      isLoading: true,
      errorMessage: null,
      ...(isSameUser
        ? {}
        : { attempts: [], completions: [], loadedCaregiverId: caregiverId }),
    });

    try {
      // 셋은 서로를 필요로 하지 않으므로 함께 기다린다
      const [courses, attempts, completions] = await Promise.all([
        trainingApi.listCourses(),
        trainingApi.listAttempts(caregiverId),
        trainingApi.listCompletions(caregiverId),
      ]);

      set({ courses, attempts, completions, loadedCaregiverId: caregiverId, isLoading: false });
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isLoading: false });
    }
  },

  openCourse: async (courseId) => {
    // 다른 과정을 열면 앞의 채점 결과를 지운다. 남겨 두면 이 과정의 결과처럼 보인다.
    const isSameCourse = get().course?.id === courseId;
    set({
      isCourseLoading: true,
      errorMessage: null,
      ...(isSameCourse ? {} : { course: null, questions: [], grade: null }),
    });

    try {
      const [course, questions] = await Promise.all([
        trainingApi.getCourse(courseId),
        trainingApi.listQuestions(courseId),
      ]);

      set({ course, questions, isCourseLoading: false });
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isCourseLoading: false });
    }
  },

  clearGrade: () => set({ grade: null }),

  submitQuiz: async (courseId, caregiverId, answers) => {
    set({ isSubmitting: true, errorMessage: null });

    try {
      const grade = await trainingApi.submitQuiz(courseId, caregiverId, answers);

      // 응시 기록은 받은 결과에 들어 있지만 수료 기록은 식별자까지 오지 않는다.
      // 두 목록을 화면에서 손으로 맞추면 저장된 것과 어긋나므로 다시 읽는다.
      const [attempts, completions] = await Promise.all([
        trainingApi.listAttempts(caregiverId),
        trainingApi.listCompletions(caregiverId),
      ]);

      set({ grade, attempts, completions, isSubmitting: false });
      return true;
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isSubmitting: false });
      return false;
    }
  },

  clearError: () => set({ errorMessage: null }),
}));
