import { mockAuthAdapter } from '@/api/auth.mock';
import { AuthError, type AuthAdapter } from '@/api/auth.types';

export {
  AuthError,
  toAuthErrorMessage,
  type AuthAdapter,
  type AuthErrorCode,
  type SignInInput,
  type SignUpInput,
} from '@/api/auth.types';

export { DemoAccounts, DemoPassword, resetMockAuthData } from '@/api/auth.mock';

/**
 * 인증 진입점.
 *
 * 화면과 저장소는 항상 이 파일의 `authApi`만 호출한다.
 * 어떤 구현이 연결되는지는 EXPO_PUBLIC_AUTH_MODE 하나로 결정된다.
 *
 * - mock     : 로컬 AsyncStorage 기반 Mock 인증 (Supabase 설정 전 기본값)
 * - supabase : Supabase Auth (Phase 2 후반, 프로젝트 생성 후 연결)
 */

const AuthMode = process.env.EXPO_PUBLIC_AUTH_MODE ?? 'mock';

function notConfigured(): never {
  throw new AuthError(
    'not_configured',
    'Supabase 인증이 아직 연결되지 않았습니다. .env의 EXPO_PUBLIC_AUTH_MODE를 mock으로 두고 실행해 주세요.'
  );
}

/** Supabase 프로젝트가 준비되면 이 어댑터의 본문을 Supabase Auth 호출로 채운다 */
const supabaseAuthAdapter: AuthAdapter = {
  getCurrentUser: notConfigured,
  signIn: notConfigured,
  signUp: notConfigured,
  signOut: notConfigured,
};

export const authApi: AuthAdapter = AuthMode === 'supabase' ? supabaseAuthAdapter : mockAuthAdapter;

/** 시연용 계정 안내처럼 Mock 모드에서만 노출할 UI를 감쌀 때 사용한다 */
export const isMockAuth = AuthMode !== 'supabase';
