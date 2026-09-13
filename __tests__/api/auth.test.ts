import { mockAuthAdapter as auth } from '@/api/auth.mock';
import type { SignUpInput } from '@/api/auth.types';

const input: SignUpInput = {
  email: 'new.guardian@care.test',
  password: 'password123',
  name: '  정하늘  ',
  role: 'guardian',
  phone: ' 010-1111-2222 ',
};

describe('Mock 인증', () => {
  it('가입하면 곧바로 로그인되고, 이메일은 소문자로, 이름과 연락처는 공백을 잘라 저장한다', async () => {
    const user = await auth.signUp({ ...input, email: '  New.Guardian@Care.test ' });

    expect(user).toMatchObject({ email: 'new.guardian@care.test', name: '정하늘', phone: '010-1111-2222' });
    expect(user).not.toHaveProperty('password');
    expect(await auth.getCurrentUser()).toEqual(user);
  });

  it('관리자는 가입으로 만들 수 없다 — 보내도 보호자로 만든다', async () => {
    const user = await auth.signUp({ ...input, role: 'admin' as unknown as SignUpInput['role'] });
    expect(user.role).toBe('guardian');
  });

  it('이미 가입된 이메일은 대소문자가 달라도 거절한다', async () => {
    await expect(auth.signUp({ ...input, email: 'GUARDIAN@care.test' })).rejects.toMatchObject({
      code: 'email_already_registered',
    });
  });

  it('틀린 비밀번호와 없는 이메일에 같은 문구로 답한다 — 가입 여부를 알려주지 않는다', async () => {
    await auth.signUp(input);
    await auth.signOut();

    const wrongPassword = await auth.signIn({ email: input.email, password: 'wrong-password' }).catch((e) => e);
    const unknownEmail = await auth.signIn({ email: 'nobody@care.test', password: 'password123' }).catch((e) => e);

    expect(wrongPassword.code).toBe('invalid_credentials');
    expect(unknownEmail.code).toBe('invalid_credentials');
    expect(wrongPassword.message).toBe(unknownEmail.message);
  });

  it('로그아웃하면 세션이 사라진다', async () => {
    await auth.signUp(input);
    await auth.signOut();
    expect(await auth.getCurrentUser()).toBeNull();

    const user = await auth.signIn({ email: input.email, password: input.password });
    expect(user.name).toBe('정하늘');
  });
});
