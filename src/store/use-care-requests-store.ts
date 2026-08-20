import { create } from 'zustand';

import { toApiErrorMessage } from '@/api/api-error';
import { careRequestsApi, type CareRequestInput } from '@/api/care-requests';
import type { CareRequest } from '@/types';

type CareRequestsState = {
  requests: CareRequest[];
  isLoading: boolean;
  isSubmitting: boolean;
  errorMessage: string | null;
  /** 지금 목록이 누구의 것인지. 다른 보호자가 로그인하면 목록을 먼저 비운다. */
  loadedGuardianId: string | null;
  load: (guardianId: string) => Promise<void>;
  create: (guardianId: string, input: CareRequestInput) => Promise<CareRequest | null>;
  cancel: (id: string) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  clearError: () => void;
};

/**
 * 간병 요청 목록 상태.
 *
 * 환자를 지우면 그 환자의 요청도 함께 사라지므로,
 * 환자를 삭제한 화면에서는 이 목록도 다시 불러와야 한다.
 */
export const useCareRequestsStore = create<CareRequestsState>((set, get) => ({
  requests: [],
  isLoading: false,
  isSubmitting: false,
  errorMessage: null,
  loadedGuardianId: null,

  load: async (guardianId) => {
    const isSameGuardian = get().loadedGuardianId === guardianId;
    set({
      isLoading: true,
      errorMessage: null,
      ...(isSameGuardian ? {} : { requests: [], loadedGuardianId: guardianId }),
    });

    try {
      const requests = await careRequestsApi.list(guardianId);
      set({ requests, loadedGuardianId: guardianId, isLoading: false });
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isLoading: false });
    }
  },

  create: async (guardianId, input) => {
    set({ isSubmitting: true, errorMessage: null });
    try {
      const request = await careRequestsApi.create(guardianId, input);
      set((state) => ({
        requests: [request, ...state.requests],
        isSubmitting: false,
      }));
      return request;
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isSubmitting: false });
      return null;
    }
  },

  cancel: async (id) => {
    set({ isSubmitting: true, errorMessage: null });
    try {
      const request = await careRequestsApi.cancel(id);
      set((state) => ({
        requests: state.requests.map((item) => (item.id === id ? request : item)),
        isSubmitting: false,
      }));
      return true;
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isSubmitting: false });
      return false;
    }
  },

  remove: async (id) => {
    set({ isSubmitting: true, errorMessage: null });
    try {
      await careRequestsApi.remove(id);
      set((state) => ({
        requests: state.requests.filter((item) => item.id !== id),
        isSubmitting: false,
      }));
      return true;
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isSubmitting: false });
      return false;
    }
  },

  clearError: () => set({ errorMessage: null }),
}));
