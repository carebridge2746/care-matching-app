import { ApiError } from '@/api/api-error';
import { readMockUsers } from '@/api/auth.mock';
import {
  delay,
  loadMatches,
  loadReviewReports,
  loadReviews,
  saveReviewReports,
  saveReviews,
  type StoredReviewReport,
} from '@/api/mock-store';
import type { ReviewsAdapter } from '@/api/reviews.types';
import { maskPersonName } from '@/lib/privacy';
import {
  EmptyRating,
  MaxRating,
  MinRating,
  type PublicReview,
  type Review,
  type UserRating,
} from '@/types';

/**
 * 로컬 Mock 후기 저장소.
 *
 * Supabase 쪽에서 create_review() 와 user_ratings 뷰가 하는 일을 여기서 그대로 한다.
 * 특히 세 가지 규칙은 양쪽 구현이 같은 답을 내야 한다.
 *   - 끝난 간병(completed)에만 쓸 수 있다
 *   - 한 매칭에 한 사람은 한 번만 쓴다
 *   - 피평가자는 앱이 정하지 않고 매칭의 상대편으로 결정된다
 */

function createId(): string {
  return `review-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createReportId(): string {
  return `report-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 최근에 받은 후기가 위로 오도록 정렬한다 */
function byNewest(a: { createdAt: string }, b: { createdAt: string }): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/**
 * 관리자가 지운 후기를 걸러낸다.
 *
 * Supabase 쪽에서 user_ratings 뷰와 public_reviews() 에 붙인 `deleted_at is null` 과
 * 같은 조건이며, 두 모드가 반드시 같은 답을 내야 하는 자리다. 한쪽에서만 빠지면
 * 목록에는 없는데 평균에는 남는 상태가 되고, 그건 아무도 바로 알아차리지 못한다.
 *
 * 작성자 본인의 목록(listWritten)에는 일부러 쓰지 않는다 — 자기 후기가 왜 사라졌는지는
 * 본인에게 보여야 한다.
 */
function isLive(review: Review): boolean {
  return review.deletedAt === undefined;
}

function toRating(reviews: Review[]): UserRating {
  if (reviews.length === 0) {
    return EmptyRating;
  }

  const total = reviews.reduce((sum, review) => sum + review.rating, 0);
  // 소수점 둘째 자리까지. Supabase 의 round(avg(rating), 2) 와 같은 값이 나와야 한다.
  return {
    ratingAvg: Math.round((total / reviews.length) * 100) / 100,
    reviewCount: reviews.length,
  };
}

export const mockReviewsAdapter: ReviewsAdapter = {
  async listWritten(reviewerId) {
    await delay();
    const reviews = await loadReviews();
    return reviews.filter((review) => review.reviewerId === reviewerId).sort(byNewest);
  },

  async listReceived(userId) {
    await delay();
    const [reviews, users] = await Promise.all([loadReviews(), readMockUsers()]);

    return reviews
      .filter((review) => review.revieweeId === userId && isLive(review))
      .sort(byNewest)
      .map((review): PublicReview => {
        const reviewer = users.find((user) => user.id === review.reviewerId);

        return {
          id: review.id,
          rating: review.rating,
          ...(review.comment ? { comment: review.comment } : {}),
          createdAt: review.createdAt,
          // 후기를 누가 썼는지는 당사자끼리만 알면 된다
          reviewerName: maskPersonName(reviewer?.name ?? '알 수 없음'),
        };
      });
  },

  async ratingOf(userId) {
    await delay();
    const reviews = await loadReviews();
    return toRating(reviews.filter((review) => review.revieweeId === userId && isLive(review)));
  },

  async create(matchId, reviewerId, input) {
    await delay();

    if (input.rating < MinRating || input.rating > MaxRating) {
      throw new ApiError('invalid_input', `별점은 ${MinRating}점에서 ${MaxRating}점 사이여야 합니다.`);
    }

    const matches = await loadMatches();
    const match = matches.find((item) => item.id === matchId);

    // 당사자가 아닌 사람에게는 "없다"고 답한다
    if (!match || (match.guardianId !== reviewerId && match.caregiverId !== reviewerId)) {
      throw new ApiError('not_found', '간병 정보를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }
    if (match.status !== 'completed') {
      throw new ApiError('invalid_state', '끝난 간병에만 후기를 남길 수 있습니다.');
    }

    const reviews = await loadReviews();

    // 지워진 후기도 함께 센다. 지워졌다고 다시 쓸 수 있게 되면 삭제가 곧 재작성의 기회가 된다 —
    // Supabase 쪽에서는 reviews_one_per_reviewer 유니크 제약이 같은 일을 한다.
    if (reviews.some((review) => review.matchId === matchId && review.reviewerId === reviewerId)) {
      throw new ApiError('invalid_state', '이미 이 간병에 후기를 남기셨습니다.');
    }

    const comment = input.comment?.trim();
    const review: Review = {
      id: createId(),
      matchId,
      reviewerId,
      // 상대편이 누구인지는 매칭이 알고 있다
      revieweeId: match.guardianId === reviewerId ? match.caregiverId : match.guardianId,
      rating: input.rating,
      ...(comment ? { comment } : {}),
      createdAt: new Date().toISOString(),
    };

    await saveReviews([...reviews, review]);
    return review;
  },

  async report(reviewId, reporterId, input) {
    await delay();

    const reviews = await loadReviews();
    const review = reviews.find((item) => item.id === reviewId);

    // 당사자가 아닌 사람에게는 "없다"고 답한다.
    // Supabase 쪽 report_review() 도 없는 후기와 남의 후기를 구분해서 알려 주지 않는다.
    if (!review || (review.reviewerId !== reporterId && review.revieweeId !== reporterId)) {
      throw new ApiError('not_found', '후기를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }
    if (!isLive(review)) {
      throw new ApiError('invalid_state', '이미 지워진 후기입니다.');
    }

    const reports = await loadReviewReports();

    if (reports.some((item) => item.reviewId === reviewId && item.reporterId === reporterId)) {
      throw new ApiError('invalid_state', '이미 신고하셨거나, 신고할 수 없는 후기입니다.');
    }

    const detail = input.detail?.trim();
    const report: StoredReviewReport = {
      id: createReportId(),
      reviewId,
      reporterId,
      reason: input.reason,
      ...(detail ? { detail } : {}),
      status: 'open',
      createdAt: new Date().toISOString(),
    };

    await saveReviewReports([...reports, report]);
    return report;
  },

  async listReports(reporterId) {
    await delay();
    const reports = await loadReviewReports();
    return reports.filter((report) => report.reporterId === reporterId).sort(byNewest);
  },
};

/** 추천 목록이 후보의 평균 별점을 붙일 때 쓴다 (Supabase 쪽에서는 user_ratings 뷰가 같은 일을 한다) */
export async function readMockRatings(): Promise<Map<string, UserRating>> {
  const reviews = await loadReviews();
  const byUser = new Map<string, Review[]>();

  // 지워진 후기는 추천 목록의 평균에도 들어가지 않는다.
  // Supabase 쪽에서는 recommendation_candidates() 가 user_ratings 뷰를 조인하므로
  // 뷰에 붙인 조건이 그대로 따라온다.
  for (const review of reviews.filter(isLive)) {
    byUser.set(review.revieweeId, [...(byUser.get(review.revieweeId) ?? []), review]);
  }

  return new Map([...byUser].map(([userId, list]) => [userId, toRating(list)]));
}
