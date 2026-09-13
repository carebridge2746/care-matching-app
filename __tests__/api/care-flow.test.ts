import { mockCareRequestsAdapter as requests } from '@/api/care-requests.mock';
import { mockMatchHistoryAdapter as history } from '@/api/match-history.mock';
import { mockMatchingAdapter as matching } from '@/api/matching.mock';
import { loadMatches, loadPatients, saveMatches } from '@/api/mock-store';
import { mockPatientsAdapter as patients } from '@/api/patients.mock';
import { DemoTrainingCourses } from '@/api/training.demo';
import { mockTrainingAdapter as training } from '@/api/training.mock';
import { scoreMatch } from '@/lib/matching';
import { ContactRetentionDays } from '@/lib/privacy';
import type { AiCareConditions } from '@/types';

import {
  acceptRequest,
  Caregiver,
  daysFromToday,
  findMatch,
  Guardian,
  HomeCaregiver,
  NewCaregiver,
  restoreClock,
  seedPatient,
  seedRequest,
  setClock,
} from '../../test-utils/fixtures';

afterEach(restoreClock);

async function requestOf(requestId: string) {
  return (await requests.list(Guardian)).find((item) => item.id === requestId);
}

describe('환자 (Phase 3)', () => {
  it('앞뒤 공백을 자르고, 비어 있는 선택 항목은 저장하지 않는다', async () => {
    const patient = await seedPatient({ name: '  김순자  ', careNotes: '   ', relationship: '' });

    expect(patient.name).toBe('김순자');
    expect(patient).not.toHaveProperty('careNotes');
    expect(patient).not.toHaveProperty('relationship');
  });

  it('간병 기록이 없는 환자는 요청까지 함께 지운다', async () => {
    const request = await seedRequest();

    expect(await patients.remove(request.patientId)).toBe('deleted');

    expect(await patients.list(Guardian)).toHaveLength(0);
    expect(await requests.list(Guardian)).toHaveLength(0);
    expect(await loadPatients()).toHaveLength(0);
  });

  it('간병 기록이 있는 환자는 기록을 남기고 이름과 건강 정보만 지운다', async () => {
    const done = await seedRequest();
    const match = await acceptRequest(done.id);
    await history.start(match.id, Caregiver);
    await history.complete(match.id, Guardian);
    // 같은 환자로 올렸지만 아무도 수락하지 않은 요청
    const untouched = await seedRequest({ patientId: done.patientId });

    expect(await patients.remove(done.patientId)).toBe('anonymized');

    // 보호자 목록에서는 빠지고, 기록이 없는 요청만 지워진다
    expect(await patients.list(Guardian)).toHaveLength(0);
    expect((await requests.list(Guardian)).map((item) => item.id)).toEqual([done.id]);
    expect((await requests.list(Guardian)).map((item) => item.id)).not.toContain(untouched.id);
    expect(await loadMatches()).toHaveLength(1);

    const stored = (await loadPatients()).find((patient) => patient.id === done.patientId);
    expect(stored).toMatchObject({ name: '삭제된 환자', conditions: [], deletedAt: expect.any(String) });
    expect(stored).not.toHaveProperty('careNotes');
    expect(stored).not.toHaveProperty('relationship');

    // 간병인 쪽 기록에도 원래 이름과 특이사항이 남지 않는다
    const caregiverView = await findMatch(done.id, Caregiver, Caregiver);
    expect(caregiverView.patient.name).toBe('삭제된 환자');
    expect(caregiverView.patient).not.toHaveProperty('careNotes');

    await expect(patients.remove(done.patientId)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('진행 중인 간병이 있는 환자는 지울 수 없다', async () => {
    const request = await seedRequest();
    await acceptRequest(request.id);

    await expect(patients.remove(request.patientId)).rejects.toMatchObject({ code: 'invalid_state' });
    expect(await patients.list(Guardian)).toHaveLength(1);
  });

  it('기록이 있는데 대기중인 요청은 익명화하면서 취소로 닫는다 — 지운 환자로 다시 매칭되지 않게', async () => {
    const request = await seedRequest();
    const match = await acceptRequest(request.id);
    await history.cancel(match.id, Caregiver);

    expect(await patients.remove(request.patientId)).toBe('anonymized');
    expect((await requests.list(Guardian))[0]?.status).toBe('cancelled');
  });
});

describe('간병 요청과 수락 (Phase 3·4)', () => {
  it('수락 전에는 간병인에게 환자 성만 보이고, 보호자와 환자 식별자는 내려가지 않는다', async () => {
    const request = await seedRequest();
    const listed = (await requests.listAvailable(Caregiver)).find((item) => item.id === request.id);

    expect(listed?.patient.name).toBe('김OO');
    expect(listed).not.toHaveProperty('guardianId');
    expect(listed).not.toHaveProperty('patientId');
  });

  it('수락하면 요청이 매칭 완료가 되고, 수락한 간병인에게는 환자 이름이 보인다', async () => {
    const request = await seedRequest();
    const accepted = await requests.accept(request.id, Caregiver);

    expect(accepted.status).toBe('matched');
    expect(accepted.matchedCaregiverId).toBe(Caregiver);
    expect(accepted.patient.name).toBe('김순자');
    expect((await requests.listAvailable(NewCaregiver)).some((item) => item.id === request.id)).toBe(false);
  });

  it('먼저 수락한 사람이 가져간다', async () => {
    const request = await seedRequest();
    await requests.accept(request.id, Caregiver);

    await expect(requests.accept(request.id, NewCaregiver)).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('요청 원문과 AI 정리 결과는 수락 전 간병인에게 내려가지 않고, 수락한 간병인에게만 원문이 열린다', async () => {
    const aiConditions: AiCareConditions = {
      location: '서울 강남구',
      carePlace: 'hospital',
      careType: [],
      requiredSkills: [],
      schedule: { weekdays: [] },
      genderPreference: 'any',
      additionalNotes: '김순자 어머니, 강남세브란스 7층',
      confidence: 'low',
    };
    const request = await seedRequest({ requestText: '어머니 김순자, 강남세브란스 7층에 입원 중입니다.', aiConditions });

    const listed = (await requests.listAvailable(Caregiver)).find((item) => item.id === request.id);
    expect(listed).not.toHaveProperty('requestText');
    expect(listed).not.toHaveProperty('aiConditions');

    const accepted = await requests.accept(request.id, Caregiver);
    expect(accepted.requestText).toBe('어머니 김순자, 강남세브란스 7층에 입원 중입니다.');
    expect(accepted).not.toHaveProperty('aiConditions');

    // 보호자 자신에게는 그대로 보인다
    expect((await requests.list(Guardian))[0]?.requestText).toBe(request.requestText);
  });

  it('노쇼나 시작 전 취소로 다시 대기중이 된 요청도 지울 수 없고, 취소만 된다', async () => {
    const request = await seedRequest();
    const match = await acceptRequest(request.id);
    await history.cancel(match.id, Caregiver);
    expect((await requestOf(request.id))?.status).toBe('pending');

    await expect(requests.remove(request.id)).rejects.toMatchObject({ code: 'invalid_state' });

    expect((await requests.cancel(request.id)).status).toBe('cancelled');
    expect(await loadMatches()).toHaveLength(1);
  });

  it('대기중 요청은 지울 수 있고, 매칭이 진행된 요청은 지울 수 없어 취소만 된다', async () => {
    const pending = await seedRequest();
    await requests.remove(pending.id);
    expect(await requestOf(pending.id)).toBeUndefined();

    const matched = await seedRequest();
    await acceptRequest(matched.id);
    await expect(requests.remove(matched.id)).rejects.toMatchObject({ code: 'invalid_state' });

    const cancelled = await requests.cancel(matched.id);
    expect(cancelled.status).toBe('cancelled');
    expect((await findMatch(matched.id, Caregiver)).status).toBe('cancelled');
    await expect(requests.cancel(matched.id)).rejects.toMatchObject({ code: 'invalid_state' });
  });
});

describe('간병 진행 (Phase 7)', () => {
  it('시작은 출근한 간병인만 누를 수 있고, 당사자가 아니면 매칭이 없다고 답한다', async () => {
    const request = await seedRequest();
    const match = await acceptRequest(request.id);

    await expect(history.start(match.id, Guardian)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(history.start(match.id, HomeCaregiver)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('시작일 전에는 간병을 시작할 수 없다 — 기간과 기록이 어긋나지 않게 한다', async () => {
    const request = await seedRequest({ startDate: daysFromToday(1) });
    const match = await acceptRequest(request.id);

    await expect(history.start(match.id, Caregiver)).rejects.toMatchObject({ code: 'invalid_state' });
    expect((await findMatch(request.id, Caregiver)).status).toBe('accepted');
  });

  it('당일이라도 시작 3시간 전까지는 시작할 수 없다 — 저녁 간병을 아침에 시작해 두지 않게', async () => {
    const request = await seedRequest({ startDate: '2026-09-14', dailyStartTime: '17:00', dailyEndTime: '21:00' });
    const match = await acceptRequest(request.id);

    setClock(new Date(2026, 8, 14, 13, 59));
    await expect(history.start(match.id, Caregiver)).rejects.toMatchObject({
      code: 'invalid_state',
      message: expect.stringContaining('14:00부터'),
    });

    setClock(new Date(2026, 8, 14, 14, 0));
    expect((await history.start(match.id, Caregiver)).status).toBe('inProgress');
  });

  it('수락 → 시작 → 종료 순서로만 옮겨 가고, 요청 상태도 함께 따라간다', async () => {
    const request = await seedRequest();
    const match = await acceptRequest(request.id);

    await expect(history.complete(match.id, Guardian)).rejects.toMatchObject({ code: 'invalid_state' });

    expect((await history.start(match.id, Caregiver)).status).toBe('inProgress');
    expect((await requestOf(request.id))?.status).toBe('inProgress');
    await expect(history.start(match.id, Caregiver)).rejects.toMatchObject({ code: 'invalid_state' });

    // 종료는 양쪽 모두 누를 수 있다
    expect((await history.complete(match.id, Guardian)).status).toBe('completed');
    expect((await requestOf(request.id))?.status).toBe('completed');
    await expect(history.cancel(match.id, Caregiver)).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('시작 전 취소는 요청을 다시 대기중으로 연다', async () => {
    const request = await seedRequest();
    const match = await acceptRequest(request.id);

    const cancelled = await history.cancel(match.id, Caregiver, '  사정이 생겼습니다  ');

    expect(cancelled).toMatchObject({ status: 'cancelled', cancelledBy: 'caregiver', cancelReason: '사정이 생겼습니다' });
    const reopened = await requestOf(request.id);
    expect(reopened?.status).toBe('pending');
    expect(reopened).not.toHaveProperty('matchedCaregiverId');
  });

  it('시작한 뒤의 취소는 요청도 함께 닫는다', async () => {
    const request = await seedRequest();
    const match = await acceptRequest(request.id);
    await history.start(match.id, Caregiver);

    const cancelled = await history.cancel(match.id, Guardian);

    expect(cancelled.cancelledBy).toBe('guardian');
    expect((await requestOf(request.id))?.status).toBe('cancelled');
  });

  it('매칭이 성사된 동안에만 상대 이름과 환자 특이사항이 열린다', async () => {
    const request = await seedRequest();
    const match = await acceptRequest(request.id);

    const engaged = await findMatch(request.id, Caregiver, Caregiver);
    expect(engaged.patient).toMatchObject({ name: '김순자', careNotes: '저녁 약을 꼭 챙겨 주세요' });
    expect(engaged.guardian.name).toBe('김영희');

    await history.cancel(match.id, Guardian);

    const closed = await findMatch(request.id, Caregiver, Caregiver);
    expect(closed.patient.name).toBe('김OO');
    expect(closed.patient).not.toHaveProperty('careNotes');
    expect(closed.guardian).toEqual({ name: '김OO' });

    // 보호자 자신의 환자는 언제나 보인다
    expect((await findMatch(request.id, Caregiver)).patient.name).toBe('김순자');
  });

  it(`끝난 간병의 연락처·특이사항·원문은 종료 뒤 ${ContactRetentionDays}일까지만 열려 있다`, async () => {
    const request = await seedRequest();
    const match = await acceptRequest(request.id);
    await history.start(match.id, Caregiver);
    await history.complete(match.id, Guardian);

    const open = await findMatch(request.id, Caregiver, Caregiver);
    expect(open.guardian).toMatchObject({ name: '김영희', phone: expect.any(String) });
    expect(open.care.requestText).toBe(request.requestText);

    // 종료 시각을 기간보다 하루 전으로 옮긴다
    const longAgo = new Date(Date.now() - (ContactRetentionDays + 1) * 24 * 60 * 60 * 1000).toISOString();
    await saveMatches(
      (await loadMatches()).map((item) => (item.id === match.id ? { ...item, completedAt: longAgo } : item))
    );

    const closed = await findMatch(request.id, Caregiver, Caregiver);
    expect(closed.guardian).toEqual({ name: '김OO' });
    expect(closed.patient.name).toBe('김OO');
    expect(closed.patient).not.toHaveProperty('careNotes');
    expect(closed.care).not.toHaveProperty('requestText');

    // 보호자에게는 자기 환자와 원문이 그대로 보이고, 간병인의 연락처는 닫힌다
    const own = await findMatch(request.id, Caregiver);
    expect(own.patient.name).toBe('김순자');
    expect(own.care.requestText).toBe(request.requestText);
    expect(own.caregiver).toEqual({ name: '이OO' });
  });
});

describe('추천 후보 (Phase 6)', () => {
  it('맡을 수 없는 장소의 간병인과 프로필이 없는 간병인은 빠지고, 이름은 성만 보인다', async () => {
    const request = await seedRequest();
    const candidates = await matching.listCandidates(request.id);
    const ids = candidates.map((item) => item.id);

    expect(ids).toContain(Caregiver);
    expect(ids).not.toContain(HomeCaregiver);
    expect(ids).not.toContain(NewCaregiver);
    expect(candidates.find((item) => item.id === Caregiver)?.name).toBe('이OO');
  });

  it('이미 이 요청을 수락한 간병인은 다시 추천하지 않는다', async () => {
    const request = await seedRequest();
    await acceptRequest(request.id);

    expect((await matching.listCandidates(request.id)).map((item) => item.id)).not.toContain(Caregiver);
  });

  it('앱에서 수료한 교육을 함께 내보내고, 점수에도 조금 반영된다', async () => {
    const request = await seedRequest();
    const course = DemoTrainingCourses[0]!;
    await training.submitQuiz(
      course.id,
      Caregiver,
      course.questions.map((question) => ({ questionId: question.id, choiceIndex: question.answerIndex }))
    );

    const candidate = (await matching.listCandidates(request.id)).find((item) => item.id === Caregiver);
    expect(candidate?.completedTrainings).toEqual([course.title]);
    expect(scoreMatch(candidate!, request).items.find((item) => item.label === '교육 수료')?.score).toBe(2.5);

    // 수료하지 않은 과정은 세지 않는다
    const other = (await matching.listCandidates(request.id)).find((item) => item.id !== Caregiver);
    expect(other?.completedTrainings ?? []).toEqual([]);
  });

  it('없는 요청은 not_found', async () => {
    await expect(matching.listCandidates('request-nope')).rejects.toMatchObject({ code: 'not_found' });
  });
});
