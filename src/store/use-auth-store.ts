import { create } from 'zustand';

import type { AppUser } from '@/types';

type AuthState = {
  /** 로그인한 사용자. null이면 비로그인 상태 */
  user: AppUser | null;
  /** 앱 시작 시 저장된 세션을 확인하는 동안 true */
  isBootstrapping: boolean;
  setUser: (user: AppUser | null) => void;
  /** 세션 확인이 끝났음을 표시 (Phase 2에서 Supabase 세션 복원 후 호출) */
  completeBootstrap: () => void;
  signOut: () => void;
};

/**
 * 인증 상태 저장소.
 * Phase 2에서 Supabase Auth와 연결한다. 지금은 상태 골격만 둔다.
 */
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isBootstrapping: true,
  setUser: (user) => set({ user }),
  completeBootstrap: () => set({ isBootstrapping: false }),
  signOut: () => set({ user: null }),
}));
