import { mockCareRequestsAdapter as requests } from '@/api/care-requests.mock';
import { mockLocationSharingAdapter as sharing } from '@/api/location-sharing.mock';
import { mockMatchHistoryAdapter as history } from '@/api/match-history.mock';
import { loadLocationSharings, saveLocationSharings } from '@/api/mock-store';

import {
  acceptRequest,
  Caregiver,
  daysFromToday,
  Guardian,
  HomeCaregiver,
  seedAcceptedMatchForArrival,
  seedRequest,
} from '../../test-utils/fixtures';

async function current(matchId: string) {
  const [record] = await sharing.listForMatches([matchId]);
  if (!record) {
    throw new Error(`기록이 없습니다: ${matchId}`);
  }
  return record;
}

/** 동의하고 이동을 시작한 매칭 */
async function startedMatch() {
  const match = await seedAcceptedMatchForArrival();
  await sharing.giveConsent(match.id, Caregiver);
  await sharing.start(match.id, Caregiver);
  return match;
}

describe('안심 도착 — 이동과 도착 (Phase 13)', () => {
  it('1. 이동을 시작하기 전에는 not_started(이동 전)이고 동의도 없다', async () => {
    const match = await seedAcceptedMatchForArrival();

    expect(await current(match.id)).toMatchObject({ status: 'notStarted', consentGiven: false });
  });

  it('9. 위치 공유에 동의하지 않으면 이동을 시작할 수 없다', async () => {
    const match = await seedAcceptedMatchForArrival();

    await expect(sharing.start(match.id, Caregiver)).rejects.toMatchObject({ code: 'invalid_state' });
    expect((await current(match.id)).status).toBe('notStarted');

    const consented = await sharing.giveConsent(match.id, Caregiver);
    expect(consented).toMatchObject({ consentGiven: true, consentAt: expect.any(String) });
  });

  it('2. 동의 후 이동을 시작하면 sharing(공유 중)이 되고 예상 도착 시각이 생긴다', async () => {
    const match = await startedMatch();

    expect(await current(match.id)).toMatchObject({
      status: 'sharing',
      startedAt: expect.any(String),
      lastUpdatedAt: expect.any(String),
      estimatedArrivalAt: expect.any(String),
    });
  });

  it('3. 약속 장소 인근으로 바꿀 수 있다', async () => {
    const match = await startedMatch();

    const nearby = await sharing.markNearby(match.id, Caregiver);
    expect(nearby).toMatchObject({ status: 'nearby', mockProgress: 80 });
  });

  it('4. 도착 완료로 바꾸면 이동 관련 동작은 더 받지 않는다', async () => {
    const match = await startedMatch();
    await sharing.markNearby(match.id, Caregiver);

    const arrived = await sharing.markArrived(match.id, Caregiver);
    expect(arrived).toMatchObject({ status: 'arrived', arrivedAt: expect.any(String), mockProgress: 100 });
    expect(arrived).not.toHaveProperty('estimatedArrivalAt');

    await expect(sharing.markNearby(match.id, Caregiver)).rejects.toMatchObject({ code: 'invalid_state' });
    await expect(sharing.pause(match.id, Caregiver)).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('5·6. 일시 중지하면 paused 가 되고, 재개하면 멈추기 전 상태로 돌아간다', async () => {
    const match = await startedMatch();

    const paused = await sharing.pause(match.id, Caregiver);
    expect(paused).toMatchObject({ status: 'paused', stoppedAt: expect.any(String) });
    expect(paused).not.toHaveProperty('estimatedArrivalAt');

    const resumed = await sharing.resume(match.id, Caregiver);
    expect(resumed.status).toBe('sharing');
    expect(resumed).not.toHaveProperty('stoppedAt');

    // 인근까지 왔다가 멈췄다면 인근으로 되돌아간다
    await sharing.markNearby(match.id, Caregiver);
    await sharing.pause(match.id, Caregiver);
    expect((await sharing.resume(match.id, Caregiver)).status).toBe('nearby');
  });

  it('간병인이 공유를 종료하면 ended 가 되고, 다시 시작할 수 있다', async () => {
    const match = await startedMatch();

    expect(await sharing.stop(match.id, Caregiver)).toMatchObject({ status: 'ended', endedReason: 'caregiverStopped' });
    expect((await sharing.start(match.id, Caregiver)).status).toBe('sharing');
  });

  it('그 매칭의 간병인만 상태를 바꿀 수 있다', async () => {
    const match = await seedAcceptedMatchForArrival();

    await expect(sharing.giveConsent(match.id, HomeCaregiver)).rejects.toMatchObject({ code: 'not_found' });
    await expect(sharing.giveConsent(match.id, Guardian)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('간병 시작 몇 시간 전보다 이르면 이동을 시작할 수 없고, 관리자 목록에도 나오지 않는다', async () => {
    const request = await seedRequest({ startDate: daysFromToday(2) });
    const match = await acceptRequest(request.id);
    await sharing.giveConsent(match.id, Caregiver);

    await expect(sharing.start(match.id, Caregiver)).rejects.toMatchObject({ code: 'invalid_state' });
    expect((await sharing.listArrivalWatch()).some((item) => item.matchId === match.id)).toBe(false);
  });
});

describe('안심 도착 — 자동 종료 (Phase 13)', () => {
  it('7. 간병을 시작하면 공유가 끝나고, 종료한 뒤에도 끝난 채로 남는다', async () => {
    const match = await startedMatch();
    await sharing.markArrived(match.id, Caregiver);

    await history.start(match.id, Caregiver);
    expect(await current(match.id)).toMatchObject({ status: 'ended', endedReason: 'careStarted', arrivedAt: expect.any(String) });

    await history.complete(match.id, Guardian);
    expect(await current(match.id)).toMatchObject({ status: 'ended', endedReason: 'careCompleted' });

    // 끝난 간병의 공유는 다시 켤 수 없다
    await expect(sharing.start(match.id, Caregiver)).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('8. 예약이 취소되면 공유가 자동으로 끝난다 — 간병인 취소와 보호자의 요청 취소 모두', async () => {
    const byCaregiver = await startedMatch();
    await history.cancel(byCaregiver.id, Caregiver, '사정이 생겼습니다');
    expect(await current(byCaregiver.id)).toMatchObject({ status: 'ended', endedReason: 'cancelled' });

    const byGuardian = await startedMatch();
    await requests.cancel(byGuardian.requestId);
    expect(await current(byGuardian.id)).toMatchObject({ status: 'ended', endedReason: 'cancelled' });
  });

  it('공유 중인데 업데이트가 오래되면 위치 확인 불가로 보인다', async () => {
    const match = await startedMatch();
    const longAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await saveLocationSharings(
      (await loadLocationSharings()).map((item) =>
        item.matchId === match.id ? { ...item, lastUpdatedAt: longAgo } : item
      )
    );

    expect((await current(match.id)).status).toBe('unavailable');
    // 인근을 알리면 다시 확인할 수 있게 된다
    expect((await sharing.markNearby(match.id, Caregiver)).status).toBe('nearby');
  });
});

describe('안심 도착 — 노쇼·지각 판단 (Phase 13)', () => {
  it('10. 예약 시간이 지나고 이동하지 않았으면 관리자 목록에 확인 필요로 나온다', async () => {
    const waiting = await seedAcceptedMatchForArrival();
    const moving = await startedMatch();

    const watch = await sharing.listArrivalWatch();
    const item = watch.find((row) => row.matchId === waiting.id);

    expect(item).toMatchObject({ assessment: 'needsConfirmation', guardianName: '김영희', caregiverName: '이미영' });
    // 시작 시각이 지난 뒤 이동 중인 간병은 지연 가능성으로 본다
    expect(watch.find((row) => row.matchId === moving.id)?.assessment).toBe('delayed');
    // 급한 것이 위로 온다
    expect(watch[0]?.assessment).toBe('needsConfirmation');
  });

  it('12. 위치 정보만으로 노쇼가 확정되지 않는다 — 매칭과 요청 상태는 그대로다', async () => {
    const match = await seedAcceptedMatchForArrival();
    await sharing.giveConsent(match.id, Caregiver);
    await sharing.start(match.id, Caregiver);
    await sharing.pause(match.id, Caregiver);

    await sharing.listArrivalWatch();

    const after = (await history.listForGuardian(Guardian)).find((item) => item.id === match.id);
    expect(after?.status).toBe('accepted');
    expect(after).not.toHaveProperty('noShowAt');
    expect((await requests.list(Guardian)).find((item) => item.id === match.requestId)?.status).toBe('matched');

    // 노쇼는 기존대로 보호자가 직접 신고해야 남는다
    expect((await history.reportNoShow(match.id, Guardian)).status).toBe('noShow');
  });
});
