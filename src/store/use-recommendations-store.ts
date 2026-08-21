import { create } from 'zustand';

import { toApiErrorMessage } from '@/api/api-error';
import { matchingApi } from '@/api/matching';
import { RecommendationThreshold, scoreMatch } from '@/lib/matching';
import type { CareRequest, CaregiverRecommendation } from '@/types';

type RecommendationsState = {
  /** 점수가 높은 순으로 정렬된 추천 목록 */
  recommendations: CaregiverRecommendation[];
  /** 후보였지만 점수가 낮아 목록에서 뺀 인원. 0명일 때 이유를 설명하려면 필요하다. */
  belowThresholdCount: number;
  isLoading: boolean;
  errorMessage: string | null;
  /** 지금 목록이 어느 요청의 것인지. 다른 요청을 열면 먼저 비운다. */
  loadedRequestId: string | null;
  load: (request: CareRequest) => Promise<void>;
  clear: () => void;
};

/**
 * 추천 간병인 목록.
 *
 * 어댑터는 후보만 돌려주고, 순위는 여기서 매긴다.
 * 점수 규칙(src/lib/matching.ts)이 Mock·Supabase 양쪽에 한 번씩 있으면 어긋나기 때문이다.
 */
export const useRecommendationsStore = create<RecommendationsState>((set, get) => ({
  recommendations: [],
  belowThresholdCount: 0,
  isLoading: false,
  errorMessage: null,
  loadedRequestId: null,

  load: async (request) => {
    const isSameRequest = get().loadedRequestId === request.id;
    set({
      isLoading: true,
      errorMessage: null,
      ...(isSameRequest
        ? {}
        : { recommendations: [], belowThresholdCount: 0, loadedRequestId: request.id }),
    });

    try {
      const candidates = await matchingApi.listCandidates(request.id);

      const scored = candidates
        .map((caregiver) => ({ caregiver, score: scoreMatch(caregiver, request) }))
        // 어댑터가 이미 걸렀지만, 규칙이 바뀌었을 때를 대비해 여기서도 확인한다
        .filter(({ score }) => score.isEligible);

      const recommendations = scored
        .filter(({ score }) => score.total >= RecommendationThreshold)
        .sort((a, b) => b.score.total - a.score.total);

      set({
        recommendations,
        belowThresholdCount: scored.length - recommendations.length,
        loadedRequestId: request.id,
        isLoading: false,
      });
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isLoading: false });
    }
  },

  clear: () =>
    set({
      recommendations: [],
      belowThresholdCount: 0,
      loadedRequestId: null,
      errorMessage: null,
    }),
}));
