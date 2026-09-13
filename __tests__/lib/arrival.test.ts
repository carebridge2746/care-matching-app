import {
  assessArrival,
  emptyLocationSharing,
  isStoppedByCaregiver,
  isWithinSharingWindow,
  resolveLocationSharing,
  scheduledStartAt,
  StaleUpdateMinutes,
  type ArrivalMatch,
} from '@/lib/arrival';
import type { LocationSharing, MatchStatus } from '@/types';

// 2026-09-14(월) 10:00 에 시작하는 간병을 기준으로 본다
const care = { startDate: '2026-09-14', dailyStartTime: '10:00' };
const at = (hhmm: string, day = '2026-09-14') => {
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = day.split('-').map(Number);
  return new Date(y!, mo! - 1, d!, h, m);
};

function match(status: MatchStatus = 'accepted', extra: Partial<ArrivalMatch> = {}): ArrivalMatch {
  return { id: 'match-1', status, care, ...extra };
}

function sharing(extra: Partial<LocationSharing> = {}): LocationSharing {
  return { ...emptyLocationSharing('match-1'), consentGiven: true, ...extra };
}

describe('예약 시각과 공유 시간대', () => {
  it('시작 시각을 적지 않은 요청은 오전 9시로 본다', () => {
    expect(scheduledStartAt({ startDate: '2026-09-14' })).toEqual(at('09:00'));
    expect(scheduledStartAt(care)).toEqual(at('10:00'));
  });

  it('시작 3시간 전부터만 공유할 수 있다 — 일정과 관계없는 시간에는 쓰지 않는다', () => {
    expect(isWithinSharingWindow(care, at('06:59'))).toBe(false);
    expect(isWithinSharingWindow(care, at('07:00'))).toBe(true);
    expect(isWithinSharingWindow(care, at('11:00'))).toBe(true);
  });
});

describe('공유 상태 읽기', () => {
  it('기록이 없으면 이동 전이고 동의도 없다', () => {
    expect(resolveLocationSharing(undefined, match(), at('09:00'))).toEqual({
      matchId: 'match-1',
      status: 'notStarted',
      consentGiven: false,
      mockProgress: 0,
    });
  });

  it.each([
    ['inProgress', 'careStarted', { startedAt: '2026-09-14T01:00:00.000Z' }],
    ['completed', 'careCompleted', { completedAt: '2026-09-14T09:00:00.000Z' }],
    ['cancelled', 'cancelled', { cancelledAt: '2026-09-14T00:30:00.000Z' }],
    ['noShow', 'noShow', { noShowAt: '2026-09-14T02:00:00.000Z' }],
  ] as const)('매칭이 %s 이면 공유는 자동으로 끝난다 (%s)', (status, reason, times) => {
    const stored = sharing({ status: 'sharing', estimatedArrivalAt: at('09:40').toISOString() });
    const resolved = resolveLocationSharing(stored, match(status, times), at('12:00'));

    expect(resolved.status).toBe('ended');
    expect(resolved.endedReason).toBe(reason);
    expect(resolved.stoppedAt).toBe(Object.values(times)[0]);
    expect(resolved).not.toHaveProperty('estimatedArrivalAt');
  });

  it(`공유 중인데 ${StaleUpdateMinutes}분 넘게 업데이트가 없으면 위치 확인 불가로 본다`, () => {
    const stored = sharing({ status: 'sharing', lastUpdatedAt: at('09:00').toISOString() });

    expect(resolveLocationSharing(stored, match(), at('09:20')).status).toBe('sharing');
    expect(resolveLocationSharing(stored, match(), at('09:21')).status).toBe('unavailable');
  });

  it('간병인이 멈추거나 끝낸 공유만 "중지했습니다"로 알린다', () => {
    expect(isStoppedByCaregiver(sharing({ status: 'paused' }))).toBe(true);
    expect(isStoppedByCaregiver(sharing({ status: 'ended', endedReason: 'caregiverStopped' }))).toBe(true);
    expect(isStoppedByCaregiver(sharing({ status: 'ended', endedReason: 'careCompleted' }))).toBe(false);
  });
});

describe('도착 판단', () => {
  it('시작 전: 공유 시간대 밖이면 일정 전, 안이면 출발 준비', () => {
    expect(assessArrival(match(), sharing(), at('06:00'))).toBe('onTime');
    expect(assessArrival(match(), sharing(), at('08:00'))).toBe('preparing');
  });

  it('이동 중: 예상 도착이 시작 전이면 이동 중, 늦으면 지연 가능성', () => {
    const onTime = sharing({ status: 'sharing', estimatedArrivalAt: at('09:40').toISOString() });
    const late = sharing({ status: 'sharing', estimatedArrivalAt: at('10:20').toISOString() });

    expect(assessArrival(match(), onTime, at('09:00'))).toBe('moving');
    expect(assessArrival(match(), late, at('09:40'))).toBe('delayed');
  });

  it('시작 시각이 지났는데 이동하지 않았으면 확인 필요 — 노쇼로 정하지 않는다', () => {
    expect(assessArrival(match(), sharing(), at('10:01'))).toBe('needsConfirmation');
    expect(assessArrival(match(), sharing({ status: 'paused' }), at('10:30'))).toBe('needsConfirmation');
    expect(assessArrival(match(), sharing({ status: 'unavailable' }), at('10:30'))).toBe('needsConfirmation');
  });

  it('시작 시각이 지났지만 이동 중이면 지연 가능성', () => {
    const moving = sharing({ status: 'nearby', estimatedArrivalAt: at('10:05').toISOString() });
    expect(assessArrival(match(), moving, at('10:02'))).toBe('delayed');
  });

  it('도착했거나 간병이 시작되면 도착 완료, 취소·노쇼는 취소됨', () => {
    expect(assessArrival(match(), sharing({ status: 'arrived', arrivedAt: at('09:50').toISOString() }), at('11:00'))).toBe('arrived');
    expect(assessArrival(match('inProgress'), sharing(), at('11:00'))).toBe('arrived');
    expect(assessArrival(match('cancelled'), sharing(), at('11:00'))).toBe('cancelled');
    expect(assessArrival(match('noShow'), sharing(), at('11:00'))).toBe('cancelled');
  });
});
