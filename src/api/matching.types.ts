import type { CaregiverCandidate } from '@/types';

/**
 * 매칭 어댑터의 계약.
 *
 * 어댑터는 "누구를 보여 줘도 되는가"까지만 정하고, "누가 더 잘 맞는가"는 정하지 않는다.
 * 점수 계산은 Mock·Supabase 어느 쪽에서도 src/lib/matching.ts 한 곳에서만 한다 —
 * 규칙을 SQL에도 한 번 더 적으면 두 구현이 조금씩 어긋나기 시작한다.
 *
 * 대신 제외 조건(맡을 수 없는 장소, 지정된 성별이 아님)은 저장소 쪽에서도 한 번 거른다.
 * 보호자에게 애초에 후보가 될 수 없는 사람의 프로필까지 내려보낼 이유가 없기 때문이다.
 */
export type MatchingAdapter = {
  /**
   * 이 요청의 추천 후보가 될 수 있는 간병인 목록.
   *
   * 본인이 올린 요청에 대해서만 부를 수 있다.
   * 이름은 매칭이 확정되기 전까지 성만 남기고 가려서 돌려준다.
   */
  listCandidates: (requestId: string) => Promise<CaregiverCandidate[]>;
};
