import type {
  AdminAction,
  AdminReviewReport,
  DisputedMatch,
  ReviewReportStatus,
} from '@/types';

/**
 * 관리자 어댑터의 계약.
 *
 * 관리자는 다른 역할과 성격이 다르다. 보호자와 간병인은 자기 자료를 다루지만
 * 관리자는 남의 기록을 바꾼다. 그래서 이 어댑터의 모든 함수에는 두 가지가 따라붙는다.
 *
 *   - 권한 판정은 화면이 아니라 저장소에서 한다. Supabase 쪽은 함수마다 is_admin() 을
 *     확인하고, 관리자가 아니면 빈 값이 아니라 오류로 거절한다 — 조용히 빈 목록을
 *     돌려주면 앱이 그것을 "신고가 없다"로 읽는다.
 *   - 조치는 반드시 기록으로 남는다(listActions). 조치한 자리에는 결과만 남고 판단은
 *     남지 않기 때문이다 — 노쇼 신고를 되돌리면 노쇼였다는 사실 자체가 매칭에서 사라진다.
 *
 * adminId 를 받는 함수들은 Supabase 모드에서 그 값을 쓰지 않는다. 누가 조치하는지는
 * 데이터베이스가 직접 보며, 앱이 보낸 값을 믿으면 아무나 관리자로 적힐 수 있다.
 * Mock 모드에는 세션이 없어서 인자로 받아야 한다 — 후기 작성(reviewerId)과 같은 방식이다.
 *
 * 조치 함수들이 바뀐 자료를 돌려주지 않는 것은 일부러다. 후기 하나를 지우면 후기·평균·
 * 신고 상태 셋이 함께 바뀌므로, 화면에서 굴리지 않고 목록을 다시 불러온다.
 */
export type AdminAdapter = {
  /**
   * 신고 큐. 신고·후기·양쪽 사람을 이어 붙인 한 줄로 돌려준다.
   * 이름은 가리지 않는다 — 관리자는 누가 누구에게 무엇을 썼는지 봐야 판단할 수 있다.
   */
  listReports: (status: ReviewReportStatus) => Promise<AdminReviewReport[]>;
  /**
   * 후기를 지운다. 행을 실제로 지우지 않고 지운 표시만 하며,
   * 그 후기에 달린 열린 신고를 함께 마감한다.
   *
   * 이미 지워진 후기면 `invalid_state` 로 거절한다 — 목록을 띄워 둔 사이에 다른
   * 관리자가 먼저 처리하는 일은 오류가 아니라 흔한 일이므로, 화면은 목록을 다시 불러온다.
   */
  deleteReview: (reviewId: string, adminId: string, note?: string) => Promise<void>;
  /**
   * 잘못 지운 후기를 되돌린다. 지우면서 마감했던 신고는 반려로 바뀐다.
   *
   * 지우기와 한 쌍으로 둔다. 되돌릴 길이 없으면 관리자가 지우기를 망설이게 되고,
   * 그러면 창구가 있으나 마나다.
   */
  restoreReview: (reviewId: string, adminId: string, note?: string) => Promise<void>;
  /** 신고를 반려한다. 후기는 그대로 남고, 신고당한 작성자에게는 알리지 않는다. */
  dismissReport: (reportId: string, adminId: string, note?: string) => Promise<void>;
  /**
   * 관리자가 손대야 하는 매칭.
   *
   * 매칭을 통째로 훑는 창구는 두지 않는다. 열어 두면 남의 간병 내용을 아무 때나
   * 읽는 자리가 된다. 노쇼로 신고된 건과 끝날 날이 지났는데 살아 있는 건만 나온다.
   */
  listDisputedMatches: () => Promise<DisputedMatch[]>;
  /**
   * 잘못된 노쇼 신고를 되돌린다.
   *
   * 매칭을 수락 상태로 돌리지는 않는다. 신고와 동시에 요청이 다시 열렸고 그 사이
   * 다른 간병인이 수락했을 수 있어서, 되돌리면 한 요청에 살아 있는 매칭이 둘이 된다.
   * 대신 취소로 남기고 끊은 쪽에 관리자를 적는다. 그 간병인은 같은 요청을 다시
   * 수락할 수 있게 된다 — 신고가 잘못된 것이었다면 그게 맞다.
   */
  clearNoShow: (matchId: string, adminId: string, note?: string) => Promise<void>;
  /** 살아 있는 매칭을 관리자가 끊는다. 요청 처리는 당사자 취소와 같은 규칙이다. */
  cancelMatch: (matchId: string, adminId: string, reason?: string) => Promise<void>;
  /** 관리자가 한 조치의 기록. 최근 것이 위로 온다. */
  listActions: (limit?: number) => Promise<AdminAction[]>;
};

/** 조치 기록을 한 번에 몇 줄까지 읽을지 */
export const DefaultActionLimit = 50;
