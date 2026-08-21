import { create } from 'zustand';

import { toApiErrorMessage } from '@/api/api-error';
import { caregiverApi, type CaregiverProfileInput } from '@/api/caregiver';
import type { AvailabilitySlot, CaregiverProfile } from '@/types';

type CaregiverProfileState = {
  /** 아직 등록하지 않았으면 null. 불러오기 전과 구분하려면 loadedCaregiverId 를 본다. */
  profile: CaregiverProfile | null;
  isLoading: boolean;
  isSubmitting: boolean;
  errorMessage: string | null;
  /** 지금 들고 있는 프로필이 누구의 것인지. 다른 간병인이 로그인하면 먼저 비운다. */
  loadedCaregiverId: string | null;
  load: (caregiverId: string) => Promise<void>;
  saveProfile: (
    caregiverId: string,
    input: CaregiverProfileInput
  ) => Promise<CaregiverProfile | null>;
  saveAvailability: (caregiverId: string, slots: AvailabilitySlot[]) => Promise<boolean>;
  clearError: () => void;
};

/**
 * 간병인 프로필 상태.
 *
 * 프로필 화면과 가능 시간 화면이 같은 값을 본다.
 * 시간표를 저장해도 어댑터가 프로필 전체를 돌려주므로, 두 화면이 어긋날 일이 없다.
 */
export const useCaregiverProfileStore = create<CaregiverProfileState>((set, get) => ({
  profile: null,
  isLoading: false,
  isSubmitting: false,
  errorMessage: null,
  loadedCaregiverId: null,

  load: async (caregiverId) => {
    const isSameCaregiver = get().loadedCaregiverId === caregiverId;
    set({
      isLoading: true,
      errorMessage: null,
      ...(isSameCaregiver ? {} : { profile: null, loadedCaregiverId: caregiverId }),
    });

    try {
      const profile = await caregiverApi.getProfile(caregiverId);
      set({ profile, loadedCaregiverId: caregiverId, isLoading: false });
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isLoading: false });
    }
  },

  saveProfile: async (caregiverId, input) => {
    set({ isSubmitting: true, errorMessage: null });
    try {
      const profile = await caregiverApi.saveProfile(caregiverId, input);
      set({ profile, loadedCaregiverId: caregiverId, isSubmitting: false });
      return profile;
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isSubmitting: false });
      return null;
    }
  },

  saveAvailability: async (caregiverId, slots) => {
    set({ isSubmitting: true, errorMessage: null });
    try {
      const profile = await caregiverApi.saveAvailability(caregiverId, slots);
      set({ profile, loadedCaregiverId: caregiverId, isSubmitting: false });
      return true;
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isSubmitting: false });
      return false;
    }
  },

  clearError: () => set({ errorMessage: null }),
}));
