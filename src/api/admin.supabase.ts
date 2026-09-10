import { ApiError } from '@/api/api-error';
import { DefaultActionLimit, type AdminAdapter } from '@/api/admin.types';
import {
  AdminActionTargetTypeFromRow,
  AdminActionTypeFromRow,
  DisputedMatchKindFromRow,
  MatchStatusFromRow,
  ReviewReportReasonFromRow,
  type AdminActionRow,
  type AdminReviewReportRow,
  type DisputedMatchRow,
} from '@/api/database.types';
import { getSupabaseClient } from '@/api/supabase-client';
import { toApiError } from '@/api/supabase-error';
import type { AdminAction, AdminReviewReport, DisputedMatch } from '@/types';

/**
 * Supabase 관리자 어댑터.
 *
 * 관리자에게 열린 테이블은 profiles 조회 하나뿐이고, 나머지는 전부 함수 창구다.
 * 그래서 이 파일에는 admin_actions 를 읽는 곳 말고는 테이블 조회가 없다 —
 * 관리자가 무엇을 볼 수 있는지가 데이터베이스의 함수 목록에 그대로 드러난다.
 *
 * 함수들은 관리자가 아니면 42501 로 거절한다. 그 경우는 앱의 화면 분기가 이미
 * 막고 있어야 하는 상황이라 별도 문구를 만들지 않고 permission_denied 로 넘긴다.
 *
 * 조치가 null 을 돌려주는 것은 "지금 상태에서는 할 수 없다"는 뜻이다. 목록을 띄워 둔
 * 사이에 다른 관리자가 먼저 처리하는 일은 오류가 아니라 흔한 일이므로,
 * invalid_state 로 바꿔 화면이 목록을 다시 불러오게 한다.
 */

function toAdminReport(row: AdminReviewReportRow): AdminReviewReport {
  return {
    reportId: row.report_id,
    reviewId: row.review_id,
    matchId: row.match_id,
    reason: ReviewReportReasonFromRow[row.reason],
    ...(row.detail ? { detail: row.detail } : {}),
    status: row.status,
    createdAt: row.created_at,
    ...(row.resolved_at ? { resolvedAt: row.resolved_at } : {}),
    ...(row.resolution_note ? { resolutionNote: row.resolution_note } : {}),
    reportCount: row.report_count,
    reporterId: row.reporter_id,
    reporterName: row.reporter_name,
    rating: row.rating,
    ...(row.comment ? { comment: row.comment } : {}),
    reviewCreatedAt: row.review_created_at,
    ...(row.review_deleted_at ? { reviewDeletedAt: row.review_deleted_at } : {}),
    reviewerId: row.reviewer_id,
    reviewerName: row.reviewer_name,
    revieweeId: row.reviewee_id,
    revieweeName: row.reviewee_name,
  };
}

function toDisputedMatch(row: DisputedMatchRow): DisputedMatch {
  return {
    kind: DisputedMatchKindFromRow[row.kind],
    matchId: row.match_id,
    requestId: row.request_id,
    status: MatchStatusFromRow[row.status],
    region: row.region,
    startDate: row.start_date,
    ...(row.end_date ? { endDate: row.end_date } : {}),
    acceptedAt: row.accepted_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.no_show_at ? { noShowAt: row.no_show_at } : {}),
    ...(row.no_show_note ? { noShowNote: row.no_show_note } : {}),
    guardianId: row.guardian_id,
    guardianName: row.guardian_name,
    caregiverId: row.caregiver_id,
    caregiverName: row.caregiver_name,
  };
}

function toAdminAction(row: AdminActionRow): AdminAction {
  return {
    id: row.id,
    // 관리자 계정이 지워지면 비어 있다. 기록 자체는 남는다.
    ...(row.admin_id ? { adminId: row.admin_id } : {}),
    action: AdminActionTypeFromRow[row.action],
    targetType: AdminActionTargetTypeFromRow[row.target_type],
    targetId: row.target_id,
    ...(row.note ? { note: row.note } : {}),
    createdAt: row.created_at,
  };
}

/** 조치 함수 넷이 같은 방식으로 답을 읽는다 */
function ensureChanged(changedId: string | null, message: string): void {
  if (!changedId) {
    throw new ApiError('invalid_state', message);
  }
}

export const supabaseAdminAdapter: AdminAdapter = {
  async listReports(status) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('admin_review_reports', {
      target_status: status,
    });

    if (error) {
      throw toApiError(error, '신고 목록을 불러오지 못했습니다.');
    }

    return data.map(toAdminReport);
  },

  // adminId 는 쓰지 않는다. 누가 조치하는지는 데이터베이스가 직접 본다.
  async deleteReview(reviewId, _adminId, note) {
    const supabase = getSupabaseClient();
    const { data: deletedId, error } = await supabase.rpc('admin_delete_review', {
      target_review: reviewId,
      note: note?.trim() || null,
    });

    if (error) {
      throw toApiError(error, '후기를 지우지 못했습니다.');
    }

    ensureChanged(deletedId, '이미 지워진 후기이거나 찾을 수 없습니다. 목록을 새로 불러와 주세요.');
  },

  async restoreReview(reviewId, _adminId, note) {
    const supabase = getSupabaseClient();
    const { data: restoredId, error } = await supabase.rpc('admin_restore_review', {
      target_review: reviewId,
      note: note?.trim() || null,
    });

    if (error) {
      throw toApiError(error, '후기를 되돌리지 못했습니다.');
    }

    ensureChanged(
      restoredId,
      '지워지지 않은 후기이거나 찾을 수 없습니다. 목록을 새로 불러와 주세요.'
    );
  },

  async dismissReport(reportId, _adminId, note) {
    const supabase = getSupabaseClient();
    const { data: dismissedId, error } = await supabase.rpc('admin_dismiss_report', {
      target_report: reportId,
      note: note?.trim() || null,
    });

    if (error) {
      throw toApiError(error, '신고를 반려하지 못했습니다.');
    }

    ensureChanged(dismissedId, '이미 처리된 신고입니다. 목록을 새로 불러와 주세요.');
  },

  async listDisputedMatches() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('admin_disputed_matches', {});

    if (error) {
      throw toApiError(error, '확인이 필요한 간병을 불러오지 못했습니다.');
    }

    return data.map(toDisputedMatch);
  },

  async clearNoShow(matchId, _adminId, note) {
    const supabase = getSupabaseClient();
    const { data: clearedId, error } = await supabase.rpc('admin_clear_no_show', {
      target_match: matchId,
      note: note?.trim() || null,
    });

    if (error) {
      throw toApiError(error, '노쇼 신고를 되돌리지 못했습니다.');
    }

    ensureChanged(clearedId, '노쇼로 신고된 간병이 아닙니다. 목록을 새로 불러와 주세요.');
  },

  async cancelMatch(matchId, _adminId, reason) {
    const supabase = getSupabaseClient();
    const { data: cancelledId, error } = await supabase.rpc('admin_cancel_match', {
      target_match: matchId,
      reason: reason?.trim() || null,
    });

    if (error) {
      throw toApiError(error, '간병을 종료하지 못했습니다.');
    }

    ensureChanged(cancelledId, '이미 끝났거나 취소된 간병입니다. 목록을 새로 불러와 주세요.');
  },

  async listActions(limit = DefaultActionLimit) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('admin_actions')
      .select('id, admin_id, action, target_type, target_id, note, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw toApiError(error, '조치 기록을 불러오지 못했습니다.');
    }

    return data.map(toAdminAction);
  },
};
