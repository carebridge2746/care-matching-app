import { create } from 'zustand';

import { toApiErrorMessage } from '@/api/api-error';
import { careRequestsApi, type CareRequestInput } from '@/api/care-requests';
import { llmApi } from '@/api/llm';
import { today } from '@/lib/date';
import type { AiCareConditions, CareRequest } from '@/types';

type CareRequestsState = {
  requests: CareRequest[];
  isLoading: boolean;
  isSubmitting: boolean;
  /** AI 가 원문을 정리하는 중. 등록의 첫 단계이며 화면은 이때 다른 안내 문구를 보여 준다. */
  isStructuring: boolean;
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
  isStructuring: false,
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
    set({ isSubmitting: true, isStructuring: true, errorMessage: null });

    // 원문을 먼저 조건으로 정리하고, 그 결과를 요청과 함께 한 번에 저장한다.
    // 요청을 만든 뒤에 따로 붙이지 않는 이유는, 두 번째 단계가 실패하면
    // 조건이 비어 있는 요청이 남고 그 자리를 나중에 되돌릴 방법이 없기 때문이다.
    const aiConditions = await structureQuietly(input.requestText);
    set({ isStructuring: false });

    try {
      const request = await careRequestsApi.create(guardianId, {
        ...input,
        ...(aiConditions ? { aiConditions } : {}),
      });
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

/**
 * 원문을 조건으로 정리한다. 실패하면 null 을 돌려주고 등록은 그대로 이어 간다.
 *
 * AI 정리는 매칭을 돕는 보조 단계이지, 요청을 올리기 위한 준비물이 아니다.
 * 여기서 오류를 화면에 띄우면 요청이 저장되지 않은 것처럼 읽히고, 보호자는 같은 내용을
 * 다시 적게 된다. 그래서 원인은 콘솔에만 남기고 조건 없는 요청으로 저장한다.
 */
async function structureQuietly(requestText: string): Promise<AiCareConditions | null> {
  try {
    // 상대 날짜("다음 주 월요일")는 기기의 오늘을 기준으로 풀어야 한다
    return await llmApi.structureCareRequest(requestText, today());
  } catch (error) {
    console.warn('AI 조건 정리를 건너뜁니다', error);
    return null;
  }
}
