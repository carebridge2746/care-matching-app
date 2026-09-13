import { create } from 'zustand';

import { authApi, toAuthErrorMessage, type SignInInput, type SignUpInput } from '@/api/auth';
import type { AppUser } from '@/types';

type AuthState = {
  /** 로그인한 사용자. null이면 비로그인 상태 */
  user: AppUser | null;
  /** 앱 시작 시 저장된 세션을 확인하는 동안 true */
  isBootstrapping: boolean;
  /** 로그인/회원가입/로그아웃 요청 처리 중 */
  isSubmitting: boolean;
  /** 어댑터가 돌려준 오류 문구. 입력값 검증 오류는 화면에서 따로 처리한다 */
  errorMessage: string | null;
  /** 저장된 세션 복원. 앱 루트 레이아웃에서 한 번만 호출한다 */
  bootstrap: () => Promise<void>;
  /** 성공 여부를 반환해 화면이 다음 동작(이동 등)을 결정할 수 있게 한다 */
  signIn: (input: SignInInput) => Promise<boolean>;
  signUp: (input: SignUpInput) => Promise<boolean>;
  signOut: () => Promise<void>;
  /** 탈퇴. 성공하면 로그아웃된 상태가 되고, 거절되면 이유를 errorMessage 에 남긴다. */
  withdraw: () => Promise<boolean>;
  clearError: () => void;
};

/** 세션 변화 구독 해제 함수. 앱이 살아 있는 동안 유지되므로 저장소 바깥에 둔다 */
let unsubscribeFromAuthChanges: (() => void) | null = null;

/**
 * 인증 상태 저장소.
 *
 * 실제 인증 동작은 전부 `authApi`(src/api/auth.ts)에 위임하고,
 * 이 저장소는 화면이 필요로 하는 상태(사용자, 로딩, 오류)만 관리한다.
 * 따라서 Mock ↔ Supabase 전환에도 이 파일은 바뀌지 않는다.
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isBootstrapping: true,
  isSubmitting: false,
  errorMessage: null,

  bootstrap: async () => {
    // 개발 중 새로고침으로 두 번 호출되어도 세션 조회는 한 번만 수행한다
    if (!get().isBootstrapping) {
      return;
    }

    try {
      const user = await authApi.getCurrentUser();
      set({ user });
    } catch {
      // 세션 복원 실패는 비로그인으로 취급한다. 오류 문구는 로그인 시도할 때 보여준다.
      set({ user: null });
    } finally {
      set({ isBootstrapping: false });
    }

    // 토큰 갱신 실패처럼 앱이 요청하지 않은 로그아웃을 화면에 반영한다.
    // 설정이 끝나지 않아 구독 자체가 실패할 수 있는데, 그 때문에 앱이 죽으면 안 된다.
    // 무엇이 잘못됐는지는 로그인을 시도할 때 화면에 안내한다.
    try {
      unsubscribeFromAuthChanges ??= authApi.subscribe?.((user) => set({ user })) ?? null;
    } catch {
      unsubscribeFromAuthChanges = null;
    }
  },

  signIn: async (input) => {
    set({ isSubmitting: true, errorMessage: null });
    try {
      const user = await authApi.signIn(input);
      set({ user, isSubmitting: false });
      return true;
    } catch (error) {
      set({ errorMessage: toAuthErrorMessage(error), isSubmitting: false });
      return false;
    }
  },

  signUp: async (input) => {
    set({ isSubmitting: true, errorMessage: null });
    try {
      const user = await authApi.signUp(input);
      set({ user, isSubmitting: false });
      return true;
    } catch (error) {
      set({ errorMessage: toAuthErrorMessage(error), isSubmitting: false });
      return false;
    }
  },

  signOut: async () => {
    set({ isSubmitting: true });
    try {
      await authApi.signOut();
    } finally {
      // 저장소 삭제가 실패하더라도 화면상으로는 반드시 로그아웃시킨다
      set({ user: null, isSubmitting: false, errorMessage: null });
    }
  },

  withdraw: async () => {
    const userId = get().user?.id;
    if (!userId) {
      return false;
    }

    set({ isSubmitting: true, errorMessage: null });
    try {
      await authApi.withdraw(userId);
      set({ user: null, isSubmitting: false });
      return true;
    } catch (error) {
      set({ errorMessage: toAuthErrorMessage(error), isSubmitting: false });
      return false;
    }
  },

  clearError: () => set({ errorMessage: null }),
}));
