import { mockCareRequestsAdapter as requests } from '@/api/care-requests.mock';
import { mockMatchHistoryAdapter as history } from '@/api/match-history.mock';
import { mockMatchingAdapter as matching } from '@/api/matching.mock';
import { loadMatches } from '@/api/mock-store';
import { mockPatientsAdapter as patients } from '@/api/patients.mock';

import {
  acceptRequest,
  Caregiver,
  daysFromToday,
  findMatch,
  Guardian,
  HomeCaregiver,
  NewCaregiver,
  seedPatient,
  seedRequest,
} from '../../test-utils/fixtures';

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

  it('환자를 지우면 그 환자의 요청과 매칭 기록도 함께 사라진다', async () => {
    const request = await seedRequest();
    await acceptRequest(request.id);

    await patients.remove(request.patientId);

    expect(await requests.list(Guardian)).toHaveLength(0);
    expect(await loadMatches()).toHaveLength(0);
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

  it('없는 요청은 not_found', async () => {
    await expect(matching.listCandidates('request-nope')).rejects.toMatchObject({ code: 'not_found' });
  });
});
