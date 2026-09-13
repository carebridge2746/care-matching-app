import { create } from 'zustand';

import { toApiErrorMessage } from '@/api/api-error';
import { locationSharingApi } from '@/api/location-sharing';
import type { ArrivalWatchItem, LocationSharing } from '@/types';

type Action = 'giveConsent' | 'start' | 'markNearby' | 'markArrived' | 'pause' | 'resume' | 'stop';

type LocationSharingState = {
  /** 매칭 id → 안심 도착 기록. 화면이 불러온 매칭들의 것만 들고 있다. */
  byMatchId: Record<string, LocationSharing>;
  /** 관리자 화면의 도착 확인 목록 */
  watch: ArrivalWatchItem[];
  isLoading: boolean;
  isLoadingWatch: boolean;
  /** 상태를 바꾸는 중인 매칭 id. 누른 카드의 버튼만 로딩으로 바꾼다. */
  processingId: string | null;
  errorMessage: string | null;
  load: (matchIds: string[]) => Promise<void>;
  loadWatch: () => Promise<void>;
  run: (action: Action, matchId: string, caregiverId: string) => Promise<boolean>;
  clearError: () => void;
};

/**
 * 안심 도착 상태 (Phase 13).
 *
 * 보호자·간병인·관리자가 같은 저장소를 쓴다. 보는 매칭이 다를 뿐 기록의 모양은 같다.
 *
 * 매칭 목록과 따로 불러온다. 매칭 저장소를 고치지 않고 붙이기 위해서이고,
 * 이 기록은 간병 당일 몇 시간만 의미가 있어 매칭을 읽을 때마다 함께 끌고 다닐 이유가 없다.
 */
export const useLocationSharingStore = create<LocationSharingState>((set, get) => ({
  byMatchId: {},
  watch: [],
  isLoading: false,
  isLoadingWatch: false,
  processingId: null,
  errorMessage: null,

  load: async (matchIds) => {
    if (matchIds.length === 0) {
      return;
    }
    set({ isLoading: true, errorMessage: null });

    try {
      const records = await locationSharingApi.listForMatches(matchIds);
      set((state) => ({
        byMatchId: {
          ...state.byMatchId,
          ...Object.fromEntries(records.map((record) => [record.matchId, record])),
        },
        isLoading: false,
      }));
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isLoading: false });
    }
  },

  loadWatch: async () => {
    set({ isLoadingWatch: true, errorMessage: null });

    try {
      const watch = await locationSharingApi.listArrivalWatch();
      set({ watch, isLoadingWatch: false });
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isLoadingWatch: false });
    }
  },

  run: async (action, matchId, caregiverId) => {
    set({ processingId: matchId, errorMessage: null });

    try {
      const record = await locationSharingApi[action](matchId, caregiverId);
      set((state) => ({
        byMatchId: { ...state.byMatchId, [matchId]: record },
        processingId: null,
      }));
      return true;
    } catch (error) {
      const message = toApiErrorMessage(error);
      set({ processingId: null });
      // 실패는 대개 매칭 상태가 먼저 바뀌었다는 뜻이다. 이 매칭의 기록을 다시 읽는다.
      await get().load([matchId]);
      set({ errorMessage: message });
      return false;
    }
  },

  clearError: () => set({ errorMessage: null }),
}));
