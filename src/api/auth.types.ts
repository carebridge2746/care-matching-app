import type { AppUser, UserRole } from '@/types';

/**
 * 인증 어댑터의 계약.
 *
 * 화면과 저장소는 이 타입에만 의존한다. 지금은 Mock 구현(auth.mock.ts)이 연결되어 있고,
 * Supabase 프로젝트가 준비되면 같은 형태의 구현으로 갈아끼우기만 하면 된다.
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
};

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'email_already_registered'
  | 'invalid_input'
  | 'not_configured';

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
