import {
  isAuthRetryableFetchError,
  AuthError as SupabaseAuthError,
  type User,
} from '@supabase/supabase-js';

import { AuthError, type AuthAdapter, type SignInInput, type SignUpInput } from '@/api/auth.types';
import { getSupabaseClient } from '@/api/supabase-client';
import type { AppUser, UserRole } from '@/types';

/**
 * Supabase Auth 어댑터.
 *
 * 로그인 계정 자체는 auth.users 가 관리하고, 이름/유형/연락처 같은 서비스 정보는
 * public.profiles 에 둔다. profiles 행은 회원가입 시 데이터베이스 트리거가 만든다
 * (supabase/schema.sql 참고).
 *
 * 이용 유형(role)은 반드시 profiles 에서만 읽는다.
 * auth.users 의 user_metadata 는 클라이언트가 값을 넣을 수 있어서
 * 그대로 믿으면 아무나 스스로를 관리자라고 주장할 수 있다.
 */

const Roles: readonly UserRole[] = ['guardian', 'caregiver', 'admin'];

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && Roles.includes(value as UserRole);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Supabase 오류를 화면에 보여줄 수 있는 문장으로 바꾼다 */
function toAppError(error: SupabaseAuthError): AuthError {
  switch (error.code) {
    case 'invalid_credentials':
      return new AuthError('invalid_credentials', '이메일 또는 비밀번호가 올바르지 않습니다.');
    case 'email_not_confirmed':
      return new AuthError(
        'email_not_confirmed',
        '아직 메일 인증이 끝나지 않았습니다. 가입할 때 받은 메일의 링크를 눌러 주세요.'
      );
    case 'email_exists':
    case 'user_already_exists':
      return new AuthError(
        'email_already_registered',
        '이미 가입된 이메일입니다. 로그인해 주세요.'
      );
    case 'weak_password':
      return new AuthError(
        'invalid_input',
        '비밀번호가 너무 단순합니다. 더 긴 비밀번호를 사용해 주세요.'
      );
    case 'email_address_invalid':
    case 'validation_failed':
      return new AuthError('invalid_input', '입력값이 올바르지 않습니다. 다시 확인해 주세요.');
    case 'signup_disabled':
      return new AuthError('not_configured', '현재 회원가입이 막혀 있습니다. 운영자에게 문의해 주세요.');
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return new AuthError(
        'rate_limited',
        '요청이 너무 잦습니다. 잠시 기다렸다가 다시 시도해 주세요.'
      );
    case 'user_banned':
      return new AuthError('invalid_credentials', '사용이 정지된 계정입니다. 운영자에게 문의해 주세요.');
  }

  // 여기부터는 서버가 코드를 주지 않은 오류다.
  // 요청이 서버에 닿지 못했거나(status 0), 서버가 일시적으로 응답하지 못한 경우다.
  if (error.status === 429) {
    return new AuthError('rate_limited', '요청이 너무 잦습니다. 잠시 기다렸다가 다시 시도해 주세요.');
  }

  if (error.status === undefined || isAuthRetryableFetchError(error)) {
    return new AuthError(
      'network_error',
      '서버에 연결하지 못했습니다. 인터넷 연결과 Supabase 주소를 확인한 뒤 다시 시도해 주세요.'
    );
  }

  return new AuthError('unknown', '로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.');
}

/** auth.users 사용자에 대응하는 profiles 행을 읽어 앱에서 쓰는 형태로 만든다 */
async function loadProfile(user: User): Promise<AppUser> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, role, phone')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    throw new AuthError(
      'profile_unavailable',
      '사용자 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
    );
  }

  if (!data) {
    // 트리거가 없거나 스키마를 적용하지 않은 경우다. 조용히 넘어가면 원인을 찾기 어렵다.
    throw new AuthError(
      'profile_unavailable',
      '가입 정보(profiles)가 없습니다. supabase/schema.sql 을 프로젝트에 적용했는지 확인해 주세요.'
    );
  }

  if (!isUserRole(data.role)) {
    throw new AuthError(
      'profile_unavailable',
      '계정의 이용 유형이 올바르지 않습니다. 운영자에게 문의해 주세요.'
    );
  }

  return {
    id: data.id,
    email: data.email,
    name: data.name,
    role: data.role,
    ...(data.phone ? { phone: data.phone } : {}),
  };
}

export const supabaseAuthAdapter: AuthAdapter = {
  async getCurrentUser() {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      throw toAppError(error);
    }
    if (!data.session) {
      return null;
    }

    return loadProfile(data.session.user);
  },

  async signIn({ email, password }: SignInInput) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });

    if (error) {
      throw toAppError(error);
    }

    return loadProfile(data.user);
  },

  async signUp({ email, password, name, role, phone }: SignUpInput) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email: normalizeEmail(email),
      password,
      options: {
        // 트리거가 profiles 행을 만들 때 참고하는 값이다.
        // 관리자 권한은 이 값으로 정해지지 않는다 (schema.sql 에서 걸러낸다).
        data: { name: name.trim(), role, phone: phone?.trim() ?? null },
      },
    });

    if (error) {
      throw toAppError(error);
    }

    if (!data.session || !data.user) {
      // 프로젝트에서 메일 인증을 켜 둔 경우다. 가입은 됐지만 아직 로그인 상태가 아니다.
      throw new AuthError(
        'email_confirmation_required',
        '가입 확인 메일을 보냈습니다. 메일의 링크를 눌러 인증한 뒤 로그인해 주세요.'
      );
    }

    return loadProfile(data.user);
  },

  async signOut() {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      throw toAppError(error);
    }
  },

  async withdraw() {
    // TODO(Supabase): 탈퇴 함수를 schema.sql 에 두고 부른다. 규칙은 auth.mock.ts 의 withdraw 와 같다 —
    //   예정·진행 중인 간병이 있으면 거절하고, profiles 의 이름·연락처·이메일을 지우고 withdrawn_at 을 적고,
    //   기록이 없는 요청·환자는 지우고 기록이 있는 요청의 원문과 환자 정보는 익명화한다.
    //   auth.users 행은 앱이 아니라 서비스 키를 가진 Edge Function 이 막아야 한다 — 그대로 지우면
    //   profiles 에서 이어지는 cascade 로 매칭·후기 기록까지 사라진다.
    throw new AuthError('not_configured', '탈퇴는 아직 Mock 모드에서만 동작합니다.');
  },

  subscribe(onChange) {
    const supabase = getSupabaseClient();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      // 이 콜백 안에서 다른 supabase 호출을 기다리면 교착이 생길 수 있으므로
      // 세션이 끊어졌다는 사실만 전달하고, 프로필 조회는 하지 않는다.
      if (event === 'SIGNED_OUT') {
        onChange(null);
      }
    });

    return () => data.subscription.unsubscribe();
  },
};
