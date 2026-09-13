import { create } from 'zustand';

import { adminApi } from '@/api/admin';
import { toApiErrorMessage } from '@/api/api-error';
import type {
  AdminAction,
  AdminReviewReport,
  DisputedMatch,
  ReviewReportStatus,
} from '@/types';

type AdminState = {
  /** 지금 고른 처리 상태의 신고 큐 */
  reports: AdminReviewReport[];
  /** reports 가 어느 상태의 목록인지. 탭을 빠르게 바꿨을 때 늦게 온 응답을 버리는 데 쓴다. */
  reportStatus: ReviewReportStatus;
  disputedMatches: DisputedMatch[];
  actions: AdminAction[];
  /**
   * 목록마다 따로 둔다. 홈은 신고 큐와 분쟁 매칭을 함께 부르는데, 하나로 두면
   * 먼저 끝난 쪽이 아직 오고 있는 쪽의 로딩까지 꺼 버린다.
   */
  isLoadingReports: boolean;
  isLoadingDisputed: boolean;
  isLoadingActions: boolean;
  /** 조치 중인 대상 id(후기·신고·매칭). 누른 카드의 버튼만 로딩으로 바꾼다. */
  processingId: string | null;
  errorMessage: string | null;
  loadReports: (status: ReviewReportStatus) => Promise<void>;
  loadDisputedMatches: () => Promise<void>;
  loadActions: () => Promise<void>;
  deleteReview: (reviewId: string, adminId: string, note: string) => Promise<boolean>;
  restoreReview: (reviewId: string, adminId: string, note: string) => Promise<boolean>;
  dismissReport: (reportId: string, adminId: string, note: string) => Promise<boolean>;
  clearNoShow: (matchId: string, adminId: string, note: string) => Promise<boolean>;
  cancelMatch: (matchId: string, adminId: string, reason: string) => Promise<boolean>;
  clearError: () => void;
};

/**
 * 관리자 창구 상태.
 *
 * 다른 저장소와 달리 loadedUserId 를 두지 않는다. 신고 큐와 분쟁 매칭은 누구의 것도
 * 아닌 전체 목록이라, 관리자가 바뀌어도 보여 줄 내용이 같다.
 *
 * 조치가 끝나면 목록을 고쳐 끼우지 않고 다시 불러온다. 후기 하나를 지우면 그 후기에
 * 달린 신고가 모두 함께 마감되는데, 화면에 보이는 줄만 고치면 나머지가 남는다.
 */
export const useAdminStore = create<AdminState>((set, get) => ({
  reports: [],
  reportStatus: 'open',
  disputedMatches: [],
  actions: [],
  isLoadingReports: false,
  isLoadingDisputed: false,
  isLoadingActions: false,
  processingId: null,
  errorMessage: null,

  loadReports: async (status) => {
    // 다른 상태의 목록이 잠깐이라도 보이지 않도록 먼저 비운다
    const isSameStatus = get().reportStatus === status;
    set({
      isLoadingReports: true,
      errorMessage: null,
      reportStatus: status,
      ...(isSameStatus ? {} : { reports: [] }),
    });

    try {
      const reports = await adminApi.listReports(status);
      // 기다리는 사이 다른 탭을 눌렀다면 이 응답은 이미 낡았다
      if (get().reportStatus === status) {
        set({ reports, isLoadingReports: false });
      }
    } catch (error) {
      if (get().reportStatus === status) {
        set({ errorMessage: toApiErrorMessage(error), isLoadingReports: false });
      }
    }
  },

  loadDisputedMatches: async () => {
    set({ isLoadingDisputed: true, errorMessage: null });

    try {
      const disputedMatches = await adminApi.listDisputedMatches();
      set({ disputedMatches, isLoadingDisputed: false });
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isLoadingDisputed: false });
    }
  },

  loadActions: async () => {
    set({ isLoadingActions: true, errorMessage: null });

    try {
      const actions = await adminApi.listActions();
      set({ actions, isLoadingActions: false });
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isLoadingActions: false });
    }
  },

  deleteReview: async (reviewId, adminId, note) =>
    act(set, reviewId, () => adminApi.deleteReview(reviewId, adminId, note), () =>
      get().loadReports(get().reportStatus)
    ),

  restoreReview: async (reviewId, adminId, note) =>
    act(set, reviewId, () => adminApi.restoreReview(reviewId, adminId, note), () =>
      get().loadReports(get().reportStatus)
    ),

  dismissReport: async (reportId, adminId, note) =>
    act(set, reportId, () => adminApi.dismissReport(reportId, adminId, note), () =>
      get().loadReports(get().reportStatus)
    ),

  clearNoShow: async (matchId, adminId, note) =>
    act(set, matchId, () => adminApi.clearNoShow(matchId, adminId, note), () =>
      get().loadDisputedMatches()
    ),

  cancelMatch: async (matchId, adminId, reason) =>
    act(set, matchId, () => adminApi.cancelMatch(matchId, adminId, reason), () =>
      get().loadDisputedMatches()
    ),

  clearError: () => set({ errorMessage: null }),
}));

/**
 * 조치 다섯 가지가 똑같이 하는 일.
 *
 * 성공해도 실패해도 목록을 다시 부른다. 실패는 대개 "다른 관리자가 먼저 처리했다"는
 * 뜻이라 화면에 남아 있는 목록도 이미 낡았기 때문이다.
 * 다시 부르는 load 가 오류 문구를 비우므로, 안내는 그 뒤에 넣는다.
 */
async function act(
  set: (partial: Partial<AdminState>) => void,
  targetId: string,
  run: () => Promise<void>,
  reload: () => Promise<void>
): Promise<boolean> {
  set({ processingId: targetId, errorMessage: null });

  try {
    await run();
    set({ processingId: null });
    await reload();
    return true;
  } catch (error) {
    const message = toApiErrorMessage(error);
    set({ processingId: null });
    await reload();
    set({ errorMessage: message });
    return false;
  }
}
