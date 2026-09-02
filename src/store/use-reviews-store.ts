import { create } from 'zustand';

import { toApiErrorMessage } from '@/api/api-error';
import { reviewsApi } from '@/api/reviews';
import { EmptyRating, type PublicReview, type Review, type ReviewInput, type UserRating } from '@/types';

type ReviewsState = {
  /** 내가 쓴 후기. 어느 간병에 이미 남겼는지 판정하는 데 쓴다. */
  written: Review[];
  /** 내가 받은 후기. 작성자 이름은 가려져 있다. */
  received: PublicReview[];
  /** 내가 받은 평가의 요약 */
  rating: UserRating;
  isLoading: boolean;
  /** 후기를 저장하는 중인 매칭 id. 누른 카드의 버튼만 로딩으로 바꾼다. */
  submittingMatchId: string | null;
  errorMessage: string | null;
  /** 지금 목록이 누구의 것인지. 다른 사용자가 로그인하면 목록을 먼저 비운다. */
  loadedUserId: string | null;
  load: (userId: string) => Promise<void>;
  submit: (matchId: string, reviewerId: string, input: ReviewInput) => Promise<boolean>;
  clearError: () => void;
};

/**
 * 후기 상태.
 *
 * 보호자와 간병인이 같은 저장소를 쓴다. 두 사람 모두 후기를 쓰고 받으며,
 * 어느 쪽에서 보는지에 따라 달라지는 것이 없기 때문이다.
 *
 * 평균 별점을 여기서 다시 계산하지 않는다. 새 후기를 남긴 뒤에는 어댑터에서 다시 읽는다 —
 * 화면에서 평균을 굴리기 시작하면 저장된 값과 조금씩 어긋난다.
 */
export const useReviewsStore = create<ReviewsState>((set, get) => ({
  written: [],
  received: [],
  rating: EmptyRating,
  isLoading: false,
  submittingMatchId: null,
  errorMessage: null,
  loadedUserId: null,

  load: async (userId) => {
    const isSameUser = get().loadedUserId === userId;
    set({
      isLoading: true,
      errorMessage: null,
      ...(isSameUser
        ? {}
        : { written: [], received: [], rating: EmptyRating, loadedUserId: userId }),
    });

    try {
      // 셋은 서로를 필요로 하지 않으므로 함께 기다린다
      const [written, received, rating] = await Promise.all([
        reviewsApi.listWritten(userId),
        reviewsApi.listReceived(userId),
        reviewsApi.ratingOf(userId),
      ]);

      set({ written, received, rating, loadedUserId: userId, isLoading: false });
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isLoading: false });
    }
  },

  submit: async (matchId, reviewerId, input) => {
    set({ submittingMatchId: matchId, errorMessage: null });

    try {
      const review = await reviewsApi.create(matchId, reviewerId, input);
      set((state) => ({
        written: [review, ...state.written],
        submittingMatchId: null,
      }));
      return true;
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), submittingMatchId: null });
      return false;
    }
  },

  clearError: () => set({ errorMessage: null }),
}));

/** 이 간병에 이미 후기를 남겼는지. 남겼으면 버튼 대신 남긴 사실을 보여 준다. */
export function hasReviewed(written: Review[], matchId: string): boolean {
  return written.some((review) => review.matchId === matchId);
}
