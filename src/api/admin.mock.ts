import { DefaultActionLimit, type AdminAdapter } from '@/api/admin.types';
import { ApiError } from '@/api/api-error';
import { readMockUsers } from '@/api/auth.mock';
import {
  delay,
  loadAdminActions,
  loadCareRequests,
  loadMatches,
  loadReviewReports,
  loadReviews,
  saveAdminActions,
  saveCareRequests,
  saveMatches,
  saveReviewReports,
  saveReviews,
  type StoredReviewReport,
} from '@/api/mock-store';
import { today } from '@/lib/date';
import {
  isMatchLive,
  type AdminAction,
  type AdminActionTargetType,
  type AdminActionType,
  type AdminReviewReport,
  type AppUser,
  type DisputedMatch,
  type Match,
  type Review,
} from '@/types';

/**
 * 로컬 Mock 관리자 저장소.
 *
 * Supabase 쪽 admin_*() 함수들이 하는 일을 여기서 그대로 한다.
 * 다음 규칙은 양쪽 구현이 반드시 같은 답을 내야 한다.
 *   - 후기를 지워도 행은 남는다 (지운 표시만 하고, 읽는 쪽에서 걸러낸다)
 *   - 후기를 지우면 그 후기의 열린 신고가 함께 마감된다
 *   - 되돌리면 그때 마감했던 신고가 반려로 바뀐다
 *   - 노쇼를 되돌려도 매칭은 수락 상태로 돌아가지 않는다 (취소로 남는다)
 *   - 모든 조치가 기록으로 남는다
 *
 * 권한은 확인하지 않는다. Mock 모드에는 세션이 없어 부르는 쪽이 관리자인지 알 수 없고,
 * Supabase 쪽에서 그 판정을 하는 것은 데이터베이스다 — 여기서 흉내 내면 앱이 스스로
 * 권한을 판정한다는 잘못된 인상만 남는다. 화면 분기(admin 역할)가 진입을 막는다.
 */

function createActionId(): string {
  return `action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function byNewest(a: { createdAt: string }, b: { createdAt: string }): number {
  return b.createdAt.localeCompare(a.createdAt);
}

function byOldest(a: { createdAt: string }, b: { createdAt: string }): number {
  return a.createdAt.localeCompare(b.createdAt);
}

function nameOf(users: AppUser[], userId: string): string {
  return users.find((user) => user.id === userId)?.name ?? '알 수 없음';
}

/**
 * 조치를 기록으로 남긴다.
 * Supabase 쪽에서는 log_admin_action() 이 같은 일을 하며, 앱에는 열려 있지 않다.
 */
async function logAction(
  adminId: string,
  action: AdminActionType,
  targetType: AdminActionTargetType,
  targetId: string,
  note?: string
): Promise<void> {
  const actions = await loadAdminActions();
  const trimmed = note?.trim();

  const entry: AdminAction = {
    id: createActionId(),
    adminId,
    action,
    targetType,
    targetId,
    ...(trimmed ? { note: trimmed } : {}),
    createdAt: new Date().toISOString(),
  };

  await saveAdminActions([entry, ...actions]);
}

/** 신고 한 줄에 후기와 사람을 이어 붙인다 — Supabase 쪽 admin_review_reports() 의 조인 */
function toAdminReport(
  report: StoredReviewReport,
  review: Review,
  users: AppUser[],
  reportCount: number
): AdminReviewReport {
  return {
    reportId: report.id,
    reviewId: report.reviewId,
    matchId: review.matchId,
    reason: report.reason,
    ...(report.detail ? { detail: report.detail } : {}),
    status: report.status,
    createdAt: report.createdAt,
    ...(report.resolvedAt ? { resolvedAt: report.resolvedAt } : {}),
    ...(report.resolutionNote ? { resolutionNote: report.resolutionNote } : {}),
    reportCount,
    reporterId: report.reporterId,
    reporterName: nameOf(users, report.reporterId),
    rating: review.rating,
    ...(review.comment ? { comment: review.comment } : {}),
    reviewCreatedAt: review.createdAt,
    ...(review.deletedAt ? { reviewDeletedAt: review.deletedAt } : {}),
    reviewerId: review.reviewerId,
    reviewerName: nameOf(users, review.reviewerId),
    revieweeId: review.revieweeId,
    revieweeName: nameOf(users, review.revieweeId),
  };
}

export const mockAdminAdapter: AdminAdapter = {
  async listReports(status) {
    await delay();
    const [reports, reviews, users] = await Promise.all([
      loadReviewReports(),
      loadReviews(),
      readMockUsers(),
    ]);

    const countByReview = new Map<string, number>();
    for (const report of reports) {
      countByReview.set(report.reviewId, (countByReview.get(report.reviewId) ?? 0) + 1);
    }

    return reports
      .filter((report) => report.status === status)
      // 오래 기다린 신고가 위로. Supabase 쪽도 created_at 오름차순이다.
      .sort(byOldest)
      .flatMap((report) => {
        const review = reviews.find((item) => item.id === report.reviewId);
        // 후기가 사라진 신고는 큐에 내보내지 않는다. Supabase 쪽에서는 신고 행이
        // on delete cascade 로 함께 사라지므로 애초에 나오지 않는다.
        return review
          ? [toAdminReport(report, review, users, countByReview.get(report.reviewId) ?? 1)]
          : [];
      });
  },

  async deleteReview(reviewId, adminId, note) {
    await delay();
    const reviews = await loadReviews();
    const review = reviews.find((item) => item.id === reviewId);

    if (!review || review.deletedAt !== undefined) {
      throw new ApiError(
        'invalid_state',
        '이미 지워진 후기이거나 찾을 수 없습니다. 목록을 새로 불러와 주세요.'
      );
    }

    const now = new Date().toISOString();
    const trimmed = note?.trim();

    await saveReviews(
      reviews.map((item) => (item.id === reviewId ? { ...item, deletedAt: now } : item))
    );

    // 이 후기에 달린 열린 신고를 한 번에 마감한다.
    // 하나를 지우면 나머지 신고도 답을 받은 것이다.
    const reports = await loadReviewReports();
    await saveReviewReports(
      reports.map((report) =>
        report.reviewId === reviewId && report.status === 'open'
          ? {
              ...report,
              status: 'accepted',
              resolvedAt: now,
              ...(trimmed ? { resolutionNote: trimmed } : {}),
            }
          : report
      )
    );

    await logAction(adminId, 'reviewDeleted', 'review', reviewId, note);
  },

  async restoreReview(reviewId, adminId, note) {
    await delay();
    const reviews = await loadReviews();
    const review = reviews.find((item) => item.id === reviewId);

    if (!review || review.deletedAt === undefined) {
      throw new ApiError(
        'invalid_state',
        '지워지지 않은 후기이거나 찾을 수 없습니다. 목록을 새로 불러와 주세요.'
      );
    }

    const now = new Date().toISOString();
    const trimmed = note?.trim();

    await saveReviews(
      reviews.map((item) => {
        if (item.id !== reviewId) {
          return item;
        }
        const { deletedAt: _deletedAt, ...rest } = item;
        return rest;
      })
    );

    // 지우면서 마감했던 신고를 반려로 돌린다. 후기가 돌아왔다면 그 신고는
    // 받아들여진 것이 아니게 되고, 그대로 두면 "지웠다"로 읽힌다.
    const reports = await loadReviewReports();
    await saveReviewReports(
      reports.map((report) =>
        report.reviewId === reviewId && report.status === 'accepted'
          ? {
              ...report,
              status: 'dismissed',
              resolvedAt: now,
              ...(trimmed ? { resolutionNote: trimmed } : {}),
            }
          : report
      )
    );

    await logAction(adminId, 'reviewRestored', 'review', reviewId, note);
  },

  async dismissReport(reportId, adminId, note) {
    await delay();
    const reports = await loadReviewReports();
    const report = reports.find((item) => item.id === reportId);

    if (!report || report.status !== 'open') {
      throw new ApiError('invalid_state', '이미 처리된 신고입니다. 목록을 새로 불러와 주세요.');
    }

    const now = new Date().toISOString();
    const trimmed = note?.trim();

    await saveReviewReports(
      reports.map((item) =>
        item.id === reportId
          ? {
              ...item,
              status: 'dismissed',
              resolvedAt: now,
              ...(trimmed ? { resolutionNote: trimmed } : {}),
            }
          : item
      )
    );

    await logAction(adminId, 'reportDismissed', 'reviewReport', reportId, note);
  },

  async listDisputedMatches() {
    await delay();
    const [matches, requests, users] = await Promise.all([
      loadMatches(),
      loadCareRequests(),
      readMockUsers(),
    ]);

    const now = today();

    return matches
      .flatMap((match): DisputedMatch[] => {
        const request = requests.find((item) => item.id === match.requestId);

        if (!request) {
          return [];
        }

        // 끝날 날이 지났는데 아직 살아 있는 간병. 종료일을 적지 않은 요청은
        // 언제 끝나는지 알 수 없으므로 방치로 보지 않는다.
        const isOverdue =
          isMatchLive(match.status) && request.endDate !== undefined && request.endDate < now;

        if (match.status !== 'noShow' && !isOverdue) {
          return [];
        }

        return [
          {
            kind: match.status === 'noShow' ? 'noShow' : 'overdue',
            matchId: match.id,
            requestId: match.requestId,
            status: match.status,
            region: request.region,
            startDate: request.startDate,
            ...(request.endDate ? { endDate: request.endDate } : {}),
            acceptedAt: match.acceptedAt,
            ...(match.startedAt ? { startedAt: match.startedAt } : {}),
            ...(match.noShowAt ? { noShowAt: match.noShowAt } : {}),
            ...(match.noShowNote ? { noShowNote: match.noShowNote } : {}),
            guardianId: match.guardianId,
            guardianName: nameOf(users, match.guardianId),
            caregiverId: match.caregiverId,
            caregiverName: nameOf(users, match.caregiverId),
          },
        ];
      })
      // 급한 것이 위로: 노쇼는 신고된 순, 방치된 매칭은 오래 지난 순
      .sort((a, b) => (b.noShowAt ?? b.endDate ?? '').localeCompare(a.noShowAt ?? a.endDate ?? ''));
  },

  async clearNoShow(matchId, adminId, note) {
    await delay();
    const matches = await loadMatches();
    const match = matches.find((item) => item.id === matchId);

    if (!match || match.status !== 'noShow') {
      throw new ApiError(
        'invalid_state',
        '노쇼로 신고된 간병이 아닙니다. 목록을 새로 불러와 주세요.'
      );
    }

    const now = new Date().toISOString();
    const trimmed = note?.trim();

    // 수락 상태로 돌리지 않는다. 신고와 동시에 요청이 다시 열렸고 그 사이 다른
    // 간병인이 수락했을 수 있어서, 되돌리면 한 요청에 살아 있는 매칭이 둘이 된다.
    // 노쇼 표시는 지워지므로 무슨 일이 있었는지는 조치 기록에만 남는다.
    const cleared: Match = (() => {
      const { noShowAt: _noShowAt, noShowNote: _noShowNote, ...rest } = match;
      return {
        ...rest,
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: 'admin',
        ...(trimmed ? { cancelReason: trimmed } : {}),
        updatedAt: now,
      };
    })();

    await saveMatches(matches.map((item) => (item.id === matchId ? cleared : item)));

    // 요청은 건드리지 않는다. 신고 시점에 이미 정리되었고, 그 뒤에 일어난 일을
    // 여기서 되짚으면 지금 진행 중인 다른 매칭을 망가뜨린다.
    await logAction(adminId, 'noShowCleared', 'match', matchId, note);
  },

  async cancelMatch(matchId, adminId, reason) {
    await delay();
    const matches = await loadMatches();
    const match = matches.find((item) => item.id === matchId);

    if (!match || !isMatchLive(match.status)) {
      throw new ApiError(
        'invalid_state',
        '이미 끝났거나 취소된 간병입니다. 목록을 새로 불러와 주세요.'
      );
    }

    const now = new Date().toISOString();
    const trimmed = reason?.trim();
    const wasStarted = Boolean(match.startedAt);

    const cancelled: Match = {
      ...match,
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: 'admin',
      ...(trimmed ? { cancelReason: trimmed } : {}),
      updatedAt: now,
    };

    await saveMatches(matches.map((item) => (item.id === matchId ? cancelled : item)));

    // 요청 처리는 당사자 취소(cancel_match)와 같은 규칙이다.
    // 시작한 뒤에 끊긴 간병은 요청도 함께 닫고, 아직 시작하지 않았다면 요청을 다시 연다.
    const requests = await loadCareRequests();
    await saveCareRequests(
      requests.map((request) => {
        if (request.id !== match.requestId) {
          return request;
        }
        if (wasStarted) {
          return { ...request, status: 'cancelled' as const, updatedAt: now };
        }
        const { matchedCaregiverId: _caregiverId, matchedAt: _matchedAt, ...rest } = request;
        return { ...rest, status: 'pending' as const, updatedAt: now };
      })
    );

    await logAction(adminId, 'matchCancelled', 'match', matchId, reason);
  },

  async listActions(limit = DefaultActionLimit) {
    await delay();
    const actions = await loadAdminActions();
    return actions.sort(byNewest).slice(0, limit);
  },
};
