import { mockAuthAdapter } from '@/api/auth.mock';
import { supabaseAuthAdapter } from '@/api/auth.supabase';
import { backendMode, type BackendMode } from '@/api/mode';
import type { AuthAdapter } from '@/api/auth.types';

export {
  AuthError,
  toAuthErrorMessage,
  type AuthAdapter,
  type AuthErrorCode,
  type SignInInput,
  type SignUpInput,
} from '@/api/auth.types';

export { DemoAccounts, DemoPassword, resetMockAuthData } from '@/api/auth.mock';
export { hasSupabaseEnv } from '@/api/supabase-client';

/**
 * 인증 진입점.
 *
 * 화면과 저장소는 항상 이 파일의 `authApi`만 호출한다.
 * 어떤 구현이 연결되는지는 EXPO_PUBLIC_AUTH_MODE 하나로 결정된다.
 *
 * - mock     : 로컬 AsyncStorage 기반 Mock 인증 (Supabase 프로젝트가 없을 때)
 * - supabase : Supabase Auth + public.profiles
 *
 * 환경 변수는 앱을 시작할 때 번들에 박히므로, 값을 바꾼 뒤에는
 * 개발 서버를 다시 시작해야 반영된다.
 */

export type AuthMode = BackendMode;

/** 인증과 데이터 접근은 같은 스위치를 쓴다 (src/api/mode.ts) */
export const authMode: AuthMode = backendMode;

export const authApi: AuthAdapter = authMode === 'supabase' ? supabaseAuthAdapter : mockAuthAdapter;

/** 시연용 계정 안내처럼 Mock 모드에서만 노출할 UI를 감쌀 때 사용한다 */
export const isMockAuth = authMode === 'mock';
