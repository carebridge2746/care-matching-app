import { create } from 'zustand';

import { toApiErrorMessage } from '@/api/api-error';
import { careRequestsApi } from '@/api/care-requests';
import type { CaregiverCareRequest } from '@/types';

type CaregiverRequestsState = {
  /** 지금 수락할 수 있는 대기중 요청 */
  available: CaregiverCareRequest[];
  /** 이 간병인이 수락한 요청 */
  accepted: CaregiverCareRequest[];
  isLoading: boolean;
  /** 수락 요청을 처리하는 중인 요청 id. 누른 카드의 버튼만 로딩으로 바꾼다. */
  acceptingId: string | null;
  errorMessage: string | null;
  /** 지금 목록이 누구의 것인지. 다른 간병인이 로그인하면 목록을 먼저 비운다. */
  loadedCaregiverId: string | null;
  load: (caregiverId: string) => Promise<void>;
  accept: (id: string, caregiverId: string) => Promise<boolean>;
  clearError: () => void;
};

/**
 * 간병인이 보는 요청 상태.
 *
 * 보호자용 저장소(use-care-requests-store)와 나눠 둔다.
 * 같은 테이블을 보지만 목록의 뜻이 다르고 — 한쪽은 "내가 올린 요청",
 * 다른 쪽은 "내가 받을 수 있는 요청" — 두 화면이 동시에 살아 있는 일도 없기 때문이다.
 */
export const useCaregiverRequestsStore = create<CaregiverRequestsState>((set, get) => ({
  available: [],
  accepted: [],
  isLoading: false,
  acceptingId: null,
  errorMessage: null,
  loadedCaregiverId: null,

  load: async (caregiverId) => {
    // 다른 사용자의 목록이 잠깐이라도 보이지 않도록 먼저 비운다
    const isSameCaregiver = get().loadedCaregiverId === caregiverId;
    set({
      isLoading: true,
      errorMessage: null,
      ...(isSameCaregiver ? {} : { available: [], accepted: [], loadedCaregiverId: caregiverId }),
    });

    try {
      // 둘은 서로를 필요로 하지 않으므로 함께 기다린다
      const [available, accepted] = await Promise.all([
        careRequestsApi.listAvailable(caregiverId),
        careRequestsApi.listAccepted(caregiverId),
      ]);
      set({ available, accepted, loadedCaregiverId: caregiverId, isLoading: false });
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isLoading: false });
    }
  },

  accept: async (id, caregiverId) => {
    set({ acceptingId: id, errorMessage: null });
    try {
      const request = await careRequestsApi.accept(id, caregiverId);
      // 수락한 요청은 대기 목록에서 빠지고 내 목록 맨 위로 올라간다
      set((state) => ({
        available: state.available.filter((item) => item.id !== id),
        accepted: [request, ...state.accepted.filter((item) => item.id !== id)],
        acceptingId: null,
      }));
      return true;
    } catch (error) {
      const message = toApiErrorMessage(error);
      set({ acceptingId: null });
      // 다른 간병인이 먼저 가져갔을 수 있다. 실제 상태를 다시 불러온 뒤에 이유를 보여 준다.
      // load 가 오류 문구를 비우므로 순서를 바꾸면 안내가 화면에 남지 않는다.
      await get().load(caregiverId);
      set({ errorMessage: message });
      return false;
    }
  },

  clearError: () => set({ errorMessage: null }),
}));
