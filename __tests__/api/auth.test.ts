import { DemoPassword, mockAuthAdapter as auth } from '@/api/auth.mock';
import type { SignUpInput } from '@/api/auth.types';
import { readAllMockCaregiverProfiles } from '@/api/caregiver.mock';
import { mockMatchHistoryAdapter as history } from '@/api/match-history.mock';
import { mockMatchingAdapter as matching } from '@/api/matching.mock';
import { loadCareRequests, loadMatches, loadPatients } from '@/api/mock-store';
import { AnonymizedPatientName, WithdrawnRequestText, WithdrawnUserName } from '@/lib/privacy';

import {
  acceptRequest,
  Admin,
  Caregiver,
  findMatch,
  Guardian,
  seedCompletedMatch,
  seedPatient,
  seedRequest,
} from '../../test-utils/fixtures';

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

describe('탈퇴', () => {
  it('예정되었거나 진행 중인 간병이 있으면 보호자도 간병인도 탈퇴할 수 없다', async () => {
    const request = await seedRequest();
    const match = await acceptRequest(request.id);

    await expect(auth.withdraw(Guardian)).rejects.toMatchObject({ code: 'withdrawal_blocked' });
    await expect(auth.withdraw(Caregiver)).rejects.toMatchObject({ code: 'withdrawal_blocked' });

    await history.start(match.id, Caregiver);
    await expect(auth.withdraw(Guardian)).rejects.toMatchObject({ code: 'withdrawal_blocked' });
  });

  it('관리자 계정은 앱에서 탈퇴할 수 없다 — 조치 기록의 주인이다', async () => {
    await expect(auth.withdraw(Admin)).rejects.toMatchObject({ code: 'withdrawal_blocked' });
  });

  it('보호자가 탈퇴하면 개인정보는 지우고, 간병 기록은 탈퇴한 사용자로 남긴다', async () => {
    await auth.signIn({ email: 'guardian@care.test', password: DemoPassword });
    const done = await seedCompletedMatch();
    // 기록이 없는 환자와 요청
    const untouchedPatient = await seedPatient({ name: '박말순' });
    await seedRequest({ patientId: untouchedPatient.id });

    await auth.withdraw(Guardian);

    // 로그인이 풀리고 다시 들어올 수 없다
    expect(await auth.getCurrentUser()).toBeNull();
    await expect(auth.signIn({ email: 'guardian@care.test', password: DemoPassword })).rejects.toMatchObject({
      code: 'invalid_credentials',
    });

    // 기록이 없는 요청·환자는 지우고, 기록이 있는 요청은 원문을, 환자는 이름과 건강 정보를 지운다
    const storedRequests = await loadCareRequests();
    expect(storedRequests.map((item) => item.id)).toEqual([done.requestId]);
    expect(storedRequests[0]?.requestText).toBe(WithdrawnRequestText);

    const storedPatients = await loadPatients();
    expect(storedPatients).toHaveLength(1);
    expect(storedPatients[0]).toMatchObject({ name: AnonymizedPatientName, conditions: [] });
    expect(storedPatients[0]).not.toHaveProperty('careNotes');

    // 매칭 기록은 남고, 간병인에게는 '탈퇴한 사용자'로 보인다 — 가리지도 연락처를 남기지도 않는다
    expect(await loadMatches()).toHaveLength(1);
    const caregiverView = await findMatch(done.requestId, Caregiver, Caregiver);
    expect(caregiverView.guardian).toEqual({ name: WithdrawnUserName });
    expect(caregiverView.patient.name).toBe(AnonymizedPatientName);
  });

  it('같은 이메일로 다시 가입할 수 있지만 이전 계정과 이어지지 않는다', async () => {
    await auth.withdraw(Guardian);

    const user = await auth.signUp({ email: 'guardian@care.test', password: 'password123', name: '김영희', role: 'guardian' });
    expect(user.id).not.toBe(Guardian);
    await expect(auth.withdraw(Guardian)).rejects.toMatchObject({ code: 'invalid_credentials' });
  });

  it('간병인이 탈퇴하면 추천에서 빠지고 자기소개가 지워진다', async () => {
    const request = await seedRequest();
    expect((await matching.listCandidates(request.id)).map((item) => item.id)).toContain(Caregiver);

    await auth.withdraw(Caregiver);

    expect((await matching.listCandidates(request.id)).map((item) => item.id)).not.toContain(Caregiver);
    const profile = (await readAllMockCaregiverProfiles()).find((item) => item.id === Caregiver);
    expect(profile).toBeDefined();
    expect(profile).not.toHaveProperty('introduction');
  });
});
