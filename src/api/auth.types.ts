import type { AppUser, UserRole } from '@/types';

/**
 * 인증 어댑터의 계약.
 *
 * 화면과 저장소는 이 타입에만 의존한다.
 * 구현은 두 가지다 — 로컬 Mock(auth.mock.ts)과 Supabase Auth(auth.supabase.ts).
 * 어느 쪽이 연결되는지는 EXPO_PUBLIC_AUTH_MODE 하나로 결정된다.
 */

export type SignInInput = {
  email: string;
  password: string;
};

export type SignUpInput = {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  phone?: string;
};

export type AuthAdapter = {
  /** 저장된 세션으로 사용자 복원. 세션이 없으면 null */
  getCurrentUser: () => Promise<AppUser | null>;
  signIn: (input: SignInInput) => Promise<AppUser>;
  signUp: (input: SignUpInput) => Promise<AppUser>;
  signOut: () => Promise<void>;
  /**
   * 앱이 요청하지 않았는데 세션이 바뀌었을 때 알린다.
   * (토큰 갱신 실패, 다른 기기에서 로그아웃, 계정 삭제 등)
   * 구독을 해제하는 함수를 돌려준다. 지원하지 않는 구현은 생략한다.
   */
  subscribe?: (onChange: (user: AppUser | null) => void) => () => void;
};

export type AuthErrorCode =
  /** 이메일 또는 비밀번호가 틀림 */
  | 'invalid_credentials'
  /** 이미 가입된 이메일 */
  | 'email_already_registered'
  /** 메일 인증을 마쳐야 로그인할 수 있음 */
  | 'email_not_confirmed'
  /** 가입은 됐지만 메일 인증이 남아 아직 로그인 상태가 아님 */
  | 'email_confirmation_required'
  /** 서버가 거부한 입력값 (형식 오류, 너무 쉬운 비밀번호 등) */
  | 'invalid_input'
  /** 로그인은 됐지만 profiles 행을 읽지 못함 */
  | 'profile_unavailable'
  /** 요청이 너무 잦아 서버가 제한함 */
  | 'rate_limited'
  /** 서버에 연결하지 못함 */
  | 'network_error'
  /** 환경 변수 등 설정이 끝나지 않음 */
  | 'not_configured'
  | 'unknown';

/**
 * 어댑터가 던지는 오류.
 * message는 화면에 그대로 노출되므로 사용자가 읽을 수 있는 문장으로 작성한다.
 */
export class AuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

/** 예상하지 못한 오류까지 포함해 항상 사용자에게 보여줄 문장을 만든다 */
export function toAuthErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    return error.message;
  }
  return '알 수 없는 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}
