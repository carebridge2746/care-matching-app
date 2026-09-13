import { mockCareRequestsAdapter as requests } from '@/api/care-requests.mock';
import { mockMatchHistoryAdapter as history } from '@/api/match-history.mock';
import { mockMatchingAdapter as matching } from '@/api/matching.mock';

import {
  acceptRequest,
  Caregiver,
  daysFromToday,
  findMatch,
  Guardian,
  HomeCaregiver,
  NewCaregiver,
  restoreClock,
  seedRequest,
  setClock,
} from '../../test-utils/fixtures';

afterEach(restoreClock);

async function candidateIds(requestId: string): Promise<string[]> {
  return (await matching.listCandidates(requestId)).map((item) => item.id);
}

describe('노쇼 신고 (Phase 10)', () => {
  it('신고하면 매칭은 노쇼로 남고, 요청은 곧바로 다시 대기중이 된다', async () => {
    const request = await seedRequest({ startDate: daysFromToday(-2) });
    const match = await acceptRequest(request.id);

    const reported = await history.reportNoShow(match.id, Guardian, '  연락이 닿지 않았습니다  ');

    expect(reported.status).toBe('noShow');
    expect(typeof reported.noShowAt).toBe('string');
    expect(reported.noShowNote).toBe('연락이 닿지 않았습니다');
    // 성사되지 않은 만남이므로 간병인 연락처를 다시 가린다
    expect(reported.caregiver).toEqual({ name: '이OO' });

    const reopened = (await requests.list(Guardian)).find((item) => item.id === request.id);
    expect(reopened?.status).toBe('pending');
    expect(reopened).not.toHaveProperty('matchedCaregiverId');
    expect((await requests.listAvailable(NewCaregiver)).some((item) => item.id === request.id)).toBe(true);
  });

  it('오지 않았던 간병인은 그 요청을 다시 수락할 수 없고 추천에서도 빠진다', async () => {
    const request = await seedRequest({ startDate: daysFromToday(-2) });
    expect(await candidateIds(request.id)).toContain(Caregiver);

    const match = await acceptRequest(request.id);
    await history.reportNoShow(match.id, Guardian);

    await expect(requests.accept(request.id, Caregiver)).rejects.toMatchObject({ code: 'invalid_state' });
    expect(await candidateIds(request.id)).not.toContain(Caregiver);
  });

  it('다른 요청에서는 그대로 후보가 된다 — 노쇼 한 번으로 일을 막지 않는다', async () => {
    const first = await seedRequest({ startDate: daysFromToday(-2) });
    const match = await acceptRequest(first.id);
    await history.reportNoShow(match.id, Guardian);

    const another = await seedRequest({ startDate: daysFromToday(-1) });
    expect(await candidateIds(another.id)).toContain(Caregiver);
  });

  it('약속한 시작 시각 전에는 신고할 수 없고, 시각이 지나면 당일에도 신고할 수 있다', async () => {
    const future = await seedRequest({ startDate: daysFromToday(3) });
    const futureMatch = await acceptRequest(future.id);
    await expect(history.reportNoShow(futureMatch.id, Guardian)).rejects.toMatchObject({ code: 'invalid_state' });

    // 2026-09-14 17:00 에 시작하는 저녁 간병
    const evening = await seedRequest({ startDate: '2026-09-14', dailyStartTime: '17:00', dailyEndTime: '21:00' });
    const eveningMatch = await acceptRequest(evening.id);

    setClock(new Date(2026, 8, 14, 16, 59));
    await expect(history.reportNoShow(eveningMatch.id, Guardian)).rejects.toMatchObject({
      code: 'invalid_state',
      message: expect.stringContaining('17:00'),
    });

    setClock(new Date(2026, 8, 14, 17, 0));
    expect((await history.reportNoShow(eveningMatch.id, Guardian)).status).toBe('noShow');
  });

  it('보호자만, 당사자만, 시작하지 않은 간병만 신고할 수 있다', async () => {
    const request = await seedRequest({ startDate: daysFromToday(-1) });
    const match = await acceptRequest(request.id);

    await expect(history.reportNoShow(match.id, Caregiver)).rejects.toMatchObject({ code: 'permission_denied' });
    await expect(history.reportNoShow(match.id, HomeCaregiver)).rejects.toMatchObject({ code: 'not_found' });

    await history.start(match.id, Caregiver);
    await expect(history.reportNoShow(match.id, Guardian)).rejects.toMatchObject({ code: 'invalid_state' });
    expect((await findMatch(request.id, Caregiver)).status).toBe('inProgress');
  });
});
