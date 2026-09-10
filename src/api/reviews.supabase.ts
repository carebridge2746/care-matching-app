import { ApiError } from '@/api/api-error';
import {
  ReviewReportReasonFromRow,
  ReviewReportReasonToRow,
  type PublicReviewRow,
  type ReviewReportRow,
  type ReviewRow,
  type UserRatingRow,
} from '@/api/database.types';
import type { ReviewsAdapter } from '@/api/reviews.types';
import { getSupabaseClient } from '@/api/supabase-client';
import { toApiError } from '@/api/supabase-error';
import {
  EmptyRating,
  type PublicReview,
  type Review,
  type ReviewReport,
  type UserRating,
} from '@/types';

/**
 * Supabase 후기 어댑터.
 *
 * 앱은 reviews 테이블에 직접 쓰지 못한다. 창구는 셋이다.
 *   - 내가 쓴 후기 조회: reviews 테이블 (당사자만 읽을 수 있는 정책)
 *   - 남의 후기 조회: public.public_reviews() 함수 (작성자 이름을 가려서 내보낸다)
 *   - 작성: public.create_review() 함수 (끝난 간병인지, 이미 썼는지 판정한다)
 */

/**
 * 지운 사람(deleted_by)과 사유(deleted_reason)는 읽지 않는다.
 * 작성자에게 필요한 것은 "지워졌다"까지이고, 어느 관리자가 무슨 판단을 했는지는
 * 관리자 쪽 기록(admin_actions)에 남는다.
 */
const Columns =
  'id, match_id, reviewer_id, reviewee_id, rating, comment, created_at, deleted_at';

type SelectedReviewRow = Omit<ReviewRow, 'deleted_by' | 'deleted_reason'>;

function toReview(row: SelectedReviewRow): Review {
  return {
    id: row.id,
    matchId: row.match_id,
    reviewerId: row.reviewer_id,
    revieweeId: row.reviewee_id,
    rating: row.rating,
    ...(row.comment ? { comment: row.comment } : {}),
    createdAt: row.created_at,
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
  };
}

const ReportColumns =
  'id, review_id, reporter_id, reason, detail, status, created_at, resolved_at, resolution_note';

type SelectedReportRow = Omit<ReviewReportRow, 'resolved_by'>;

function toReport(row: SelectedReportRow): ReviewReport {
  return {
    id: row.id,
    reviewId: row.review_id,
    reason: ReviewReportReasonFromRow[row.reason],
    ...(row.detail ? { detail: row.detail } : {}),
    status: row.status,
    createdAt: row.created_at,
    ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
    ...(row.resolution_note ? { resolutionNote: row.resolution_note } : {}),
  };
}

function toPublicReview(row: PublicReviewRow): PublicReview {
  return {
    id: row.id,
    rating: row.rating,
    ...(row.comment ? { comment: row.comment } : {}),
    createdAt: row.created_at,
    reviewerName: row.reviewer_name,
  };
}

/** numeric 컬럼은 자릿수를 잃지 않도록 문자열로 내려온다 */
function toRating(row: UserRatingRow | null): UserRating {
  if (!row || row.rating_avg === null) {
    return EmptyRating;
  }

  const average = typeof row.rating_avg === 'string' ? Number(row.rating_avg) : row.rating_avg;

  return Number.isFinite(average)
    ? { ratingAvg: average, reviewCount: row.review_count }
    : EmptyRating;
}

export const supabaseReviewsAdapter: ReviewsAdapter = {
  async listWritten(reviewerId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('reviews')
      .select(Columns)
      .eq('reviewer_id', reviewerId)
      .order('created_at', { ascending: false });

    if (error) {
      throw toApiError(error, '후기를 불러오지 못했습니다.');
    }

    return data.map(toReview);
  },

  async listReceived(userId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('public_reviews', { subject_id: userId });

    if (error) {
      throw toApiError(error, '후기를 불러오지 못했습니다.');
    }

    return data.map(toPublicReview);
  },

  async ratingOf(userId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('user_ratings')
      .select('user_id, rating_avg, review_count')
      .eq('user_id', userId)
      // 후기가 한 건도 없으면 행 자체가 없다. 그것은 오류가 아니다.
      .maybeSingle();

    if (error) {
      throw toApiError(error, '평점을 불러오지 못했습니다.');
    }

    return toRating(data);
  },

  // reviewerId 는 쓰지 않는다. 누가 쓰는지는 데이터베이스가 직접 본다.
  async create(matchId, _reviewerId, input) {
    const supabase = getSupabaseClient();

    const { data: reviewId, error } = await supabase.rpc('create_review', {
      match_id: matchId,
      rating: input.rating,
      comment: input.comment?.trim() || null,
    });

    if (error) {
      // 끝나지 않은 간병에 쓰려 하면 함수가 예외를 던진다 (errcode 22023)
      if (error.code === '22023') {
        throw new ApiError('invalid_state', '끝난 간병에만 후기를 남길 수 있습니다.');
      }
      throw toApiError(error, '후기를 남기지 못했습니다.');
    }
    if (!reviewId) {
      throw new ApiError(
        'invalid_state',
        '이미 이 간병에 후기를 남기셨거나, 후기를 남길 수 없는 간병입니다.'
      );
    }

    const { data, error: readError } = await supabase
      .from('reviews')
      .select(Columns)
      .eq('id', reviewId)
      .maybeSingle();

    if (readError) {
      throw toApiError(readError, '남긴 후기를 불러오지 못했습니다.');
    }
    if (!data) {
      throw new ApiError('not_found', '남긴 후기를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }

    return toReview(data);
  },

  // create 와 같이 reporterId 는 쓰지 않는다. 누가 신고하는지는 데이터베이스가 직접 본다.
  async report(reviewId, _reporterId, input) {
    const supabase = getSupabaseClient();

    const { data: reportId, error } = await supabase.rpc('report_review', {
      target_review: reviewId,
      reason: ReviewReportReasonToRow[input.reason],
      detail: input.detail?.trim() || null,
    });

    if (error) {
      // 이미 지워진 후기를 신고하려 하면 함수가 예외를 던진다 (errcode 22023)
      if (error.code === '22023') {
        throw new ApiError('invalid_state', '이미 지워진 후기입니다.');
      }
      throw toApiError(error, '신고를 접수하지 못했습니다.');
    }
    // 당사자가 아니거나 없는 후기면 null 이 온다. 둘을 구분해서 알려 주지 않는다.
    if (!reportId) {
      throw new ApiError(
        'invalid_state',
        '이미 신고하셨거나, 신고할 수 없는 후기입니다.'
      );
    }

    const { data, error: readError } = await supabase
      .from('review_reports')
      .select(ReportColumns)
      .eq('id', reportId)
      .maybeSingle();

    if (readError) {
      throw toApiError(readError, '접수한 신고를 불러오지 못했습니다.');
    }
    if (!data) {
      throw new ApiError('not_found', '접수한 신고를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }

    return toReport(data);
  },

  async listReports(reporterId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('review_reports')
      .select(ReportColumns)
      .eq('reporter_id', reporterId)
      .order('created_at', { ascending: false });

    if (error) {
      throw toApiError(error, '신고 내역을 불러오지 못했습니다.');
    }

    return data.map(toReport);
  },
};
