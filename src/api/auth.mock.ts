import {
  AuthError,
  type AuthAdapter,
  type SignInInput,
  type SignUpInput,
} from '@/api/auth.types';
import { readJson, removeKey, writeJson } from '@/lib/storage';
import type { AppUser } from '@/types';

/**
 * 로컬 Mock 인증 어댑터.
 *
 * Supabase 프로젝트가 준비되기 전에 로그인 → 유형 분기 → 로그아웃 흐름을
 * 실제 기기/시뮬레이터에서 그대로 검증하기 위한 구현이다.
 *
 * - 사용자 목록과 세션은 AsyncStorage에 저장하므로 앱을 껐다 켜도 유지된다.
 * - 비밀번호를 평문으로 저장한다. 이 구현은 개발용이며 실제 인증은 Supabase Auth가 담당한다.
 * - 네트워크 지연을 흉내 내어 로딩 상태(버튼 스피너)까지 확인할 수 있게 한다.
 */

const UsersKey = 'careapp.mock.users';
const SessionKey = 'careapp.mock.session';

const NetworkDelayMs = 400;

/** 저장 형태 — AppUser에 로그인 검증용 비밀번호를 더한 값 */
type MockAccount = AppUser & { password: string };

/** 첫 실행 시 자동으로 만들어지는 시연용 계정 */
export const DemoPassword = 'care1234';

export const DemoAccounts: MockAccount[] = [
  {
    id: 'mock-guardian-1',
    email: 'guardian@care.test',
    password: DemoPassword,
    name: '김영희',
    role: 'guardian',
    phone: '010-1234-5678',
  },
  {
    id: 'mock-caregiver-1',
    email: 'caregiver@care.test',
    password: DemoPassword,
    name: '박정수',
    role: 'caregiver',
    phone: '010-2345-6789',
  },
  {
    id: 'mock-caregiver-2',
    email: 'caregiver2@care.test',
    password: DemoPassword,
    name: '이미영',
    role: 'caregiver',
    phone: '010-3456-7890',
  },
  {
    id: 'mock-caregiver-3',
    email: 'caregiver3@care.test',
    password: DemoPassword,
    name: '최동해',
    role: 'caregiver',
    phone: '010-4567-8901',
  },
  {
    id: 'mock-admin-1',
    email: 'admin@care.test',
    password: DemoPassword,
    name: '운영자',
    role: 'admin',
  },
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** 비밀번호를 화면 쪽으로 흘리지 않도록 저장 형태에서 공개 형태로 변환한다 */
function toAppUser({ password: _password, ...user }: MockAccount): AppUser {
  return user;
}

async function loadAccounts(): Promise<MockAccount[]> {
  const stored = await readJson<MockAccount[]>(UsersKey);

  if (!stored || stored.length === 0) {
    await writeJson(UsersKey, DemoAccounts);
    return DemoAccounts;
  }

  // 시연용 계정이 늘어났을 때 저장된 목록에 없는 것만 채워 넣는다.
  // 계정을 추가할 때마다 기기의 저장소를 지우지 않아도 되게 하려는 것이다.
  const missing = DemoAccounts.filter((demo) => !stored.some((item) => item.id === demo.id));
  if (missing.length === 0) {
    return stored;
  }

  const merged = [...stored, ...missing];
  await writeJson(UsersKey, merged);
  return merged;
}

async function saveAccounts(accounts: MockAccount[]): Promise<void> {
  await writeJson(UsersKey, accounts);
}

function createId(role: AppUser['role']): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `mock-${role}-${random}`;
}

export const mockAuthAdapter: AuthAdapter = {
  async getCurrentUser() {
    const session = await readJson<{ userId: string }>(SessionKey);
    if (!session) {
      return null;
    }

    const accounts = await loadAccounts();
    const account = accounts.find((item) => item.id === session.userId);
    if (!account) {
      // 저장된 세션이 가리키는 계정이 사라진 경우 세션도 함께 정리한다
      await removeKey(SessionKey);
      return null;
    }

    return toAppUser(account);
  },

  async signIn({ email, password }: SignInInput) {
    await delay(NetworkDelayMs);

    const accounts = await loadAccounts();
    const account = accounts.find((item) => item.email === normalizeEmail(email));

    if (!account || account.password !== password) {
      // 어떤 이메일이 가입되어 있는지 알려주지 않도록 두 경우 모두 같은 문구를 쓴다
      throw new AuthError(
        'invalid_credentials',
        '이메일 또는 비밀번호가 올바르지 않습니다.'
      );
    }

    await writeJson(SessionKey, { userId: account.id });
    return toAppUser(account);
  },

  async signUp({ email, password, name, role, phone }: SignUpInput) {
    await delay(NetworkDelayMs);

    // 관리자는 가입으로 만들 수 없다. 화면이 보호자·간병인만 보여 주지만 판정은
    // 어댑터에서도 한 번 더 한다 — Supabase 쪽에서는 handle_new_user() 트리거가
    // 앱이 보낸 값과 무관하게 같은 일을 하므로, 두 모드가 같은 답을 내야 한다.
    const signUpRole: AppUser['role'] = role === 'caregiver' ? 'caregiver' : 'guardian';

    const accounts = await loadAccounts();
    const normalizedEmail = normalizeEmail(email);

    if (accounts.some((item) => item.email === normalizedEmail)) {
      throw new AuthError(
        'email_already_registered',
        '이미 가입된 이메일입니다. 로그인해 주세요.'
      );
    }

    const account: MockAccount = {
      id: createId(signUpRole),
      email: normalizedEmail,
      password,
      name: name.trim(),
      role: signUpRole,
      ...(phone?.trim() ? { phone: phone.trim() } : {}),
    };

    await saveAccounts([...accounts, account]);
    await writeJson(SessionKey, { userId: account.id });
    return toAppUser(account);
  },

  async signOut() {
    await delay(NetworkDelayMs / 2);
    await removeKey(SessionKey);
  },
};

/**
 * 저장된 사용자 목록을 이름 조회용으로 읽는다.
 *
 * Mock 모드에는 profiles 테이블이 없어서, 추천 목록이 간병인 이름을 보여 주려면
 * 여기까지 와야 한다. 비밀번호는 떼고 넘긴다.
 */
export async function readMockUsers(): Promise<AppUser[]> {
  return (await loadAccounts()).map(toAppUser);
}

/** 개발 중 저장된 Mock 데이터를 초기화할 때 사용한다 */
export async function resetMockAuthData(): Promise<void> {
  await removeKey(SessionKey);
  await removeKey(UsersKey);
}
