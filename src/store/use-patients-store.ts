import { create } from 'zustand';

import { toApiErrorMessage } from '@/api/api-error';
import { patientsApi, type PatientInput } from '@/api/patients';
import type { Patient } from '@/types';

type PatientsState = {
  patients: Patient[];
  isLoading: boolean;
  isSubmitting: boolean;
  errorMessage: string | null;
  /** 지금 목록이 누구의 것인지. 다른 보호자가 로그인하면 목록을 먼저 비운다. */
  loadedGuardianId: string | null;
  load: (guardianId: string) => Promise<void>;
  create: (guardianId: string, input: PatientInput) => Promise<Patient | null>;
  update: (id: string, input: PatientInput) => Promise<Patient | null>;
  remove: (id: string) => Promise<boolean>;
  clearError: () => void;
};

/**
 * 환자 목록 상태.
 *
 * 실제 저장은 `patientsApi`(src/api/patients.ts)가 담당하고,
 * 이 저장소는 화면이 필요로 하는 목록·로딩·오류만 들고 있다.
 */
export const usePatientsStore = create<PatientsState>((set, get) => ({
  patients: [],
  isLoading: false,
  isSubmitting: false,
  errorMessage: null,
  loadedGuardianId: null,

  load: async (guardianId) => {
    // 다른 사용자의 목록이 잠깐이라도 보이지 않도록 먼저 비운다
    const isSameGuardian = get().loadedGuardianId === guardianId;
    set({
      isLoading: true,
      errorMessage: null,
      ...(isSameGuardian ? {} : { patients: [], loadedGuardianId: guardianId }),
    });

    try {
      const patients = await patientsApi.list(guardianId);
      set({ patients, loadedGuardianId: guardianId, isLoading: false });
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isLoading: false });
    }
  },

  create: async (guardianId, input) => {
    set({ isSubmitting: true, errorMessage: null });
    try {
      const patient = await patientsApi.create(guardianId, input);
      // 목록을 다시 불러오지 않고 앞에 붙인다 (최근 등록이 위)
      set((state) => ({
        patients: [patient, ...state.patients],
        isSubmitting: false,
      }));
      return patient;
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isSubmitting: false });
      return null;
    }
  },

  update: async (id, input) => {
    set({ isSubmitting: true, errorMessage: null });
    try {
      const patient = await patientsApi.update(id, input);
      set((state) => ({
        patients: state.patients.map((item) => (item.id === id ? patient : item)),
        isSubmitting: false,
      }));
      return patient;
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isSubmitting: false });
      return null;
    }
  },

  remove: async (id) => {
    set({ isSubmitting: true, errorMessage: null });
    try {
      await patientsApi.remove(id);
      set((state) => ({
        patients: state.patients.filter((item) => item.id !== id),
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
