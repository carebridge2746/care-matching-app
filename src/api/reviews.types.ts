import type { PublicReview, Review, ReviewInput, UserRating } from '@/types';

/**
 * 후기 어댑터의 계약.
 *
 * 화면과 저장소는 이 타입에만 의존한다.
 * 구현은 로컬 Mock(reviews.mock.ts)과 Supabase(reviews.supabase.ts) 두 가지다.
 *
 * 피평가자를 인자로 받지 않는다. 상대가 누구인지는 매칭이 이미 알고 있고,
 * 앱이 보낸 값을 믿으면 아무에게나 별점을 달 수 있다.
 *
 * 평균 별점도 저장하지 않고 조회할 때 센다. 프로필에 적어 두면 후기가 바뀔 때마다
 * 두 값이 어긋나기 시작하고, 어긋난 평균은 아무도 바로 알아차리지 못한다.
 */
export type ReviewsAdapter = {
  /**
   * 내가 쓴 후기.
   * 어느 간병에 이미 남겼는지 판정해서 버튼을 감추는 데 쓴다.
   */
  listWritten: (reviewerId: string) => Promise<Review[]>;
  /**
   * 이 사람이 받은 후기. 최근에 받은 순서로 돌려준다.
   * 작성자 이름은 성만 남기고 가려서 내려온다 — 본인이 자기 후기를 볼 때도 마찬가지다.
   */
  listReceived: (userId: string) => Promise<PublicReview[]>;
  /** 이 사람의 평균 별점과 후기 수 */
  ratingOf: (userId: string) => Promise<UserRating>;
  /**
   * 끝난 간병에 후기를 남긴다.
   *
   * 끝나지 않은 간병이거나 이미 남긴 후기가 있으면 `invalid_state` 로 거절한다.
   * 이 판정은 화면이 아니라 저장소에서 이뤄진다.
   */
  create: (matchId: string, reviewerId: string, input: ReviewInput) => Promise<Review>;
};
