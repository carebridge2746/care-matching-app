import type {
  ArrivalAssessment,
  LocationSharing,
  LocationSharingEndReason,
  Match,
  MatchCareSummary,
} from '@/types';

/**
 * 안심 도착 규칙.
 *
 * 저장소(Mock 어댑터)와 화면이 같은 판정을 쓰도록 순수 함수로 모아 둔다.
 * 실제 위치는 쓰지 않는다 — 상태와 시각만으로 판단한다.
 */

/** 간병 시작 몇 시간 전부터 이동을 알릴 수 있는지. 그 전에는 공유 버튼을 보여 주지 않는다. */
export const SharingWindowHours = 3;

/** 공유 중인데 이만큼 업데이트가 없으면 '위치 확인 불가'로 본다 */
export const StaleUpdateMinutes = 20;

/**
 * Mock 예상 도착 시각. 이동을 시작하면 이만큼 뒤, 인근이면 이만큼 뒤로 잡는다.
 * TODO(실제 위치): 이동 시간 계산 API 를 붙이면 이 상수 대신 서버가 계산한 값을 쓴다.
 */
export const MockTravelMinutes = 40;
export const MockNearbyMinutes = 5;

/**
 * 시작 시각을 적지 않은 요청의 기준 시각.
 * 기준이 없으면 지각 여부를 말할 수 없어서, 간병이 흔히 시작되는 오전 9시로 본다.
 */
export const DefaultCareStartTime = '09:00';

const MinuteMs = 60 * 1000;

/** 판정에 필요한 매칭 정보만. CareMatch 와 Mock 저장소의 매칭 둘 다 이 모양을 만들 수 있다. */
export type ArrivalMatch = Pick<
  Match,
  'id' | 'status' | 'startedAt' | 'completedAt' | 'cancelledAt' | 'noShowAt'
> & {
  care: Pick<MatchCareSummary, 'startDate' | 'dailyStartTime'>;
};

/** 예약 시작 시각. 시작일 + 시작 시각(없으면 오전 9시), 기기 현지 시간 기준이다. */
export function scheduledStartAt(care: ArrivalMatch['care']): Date {
  const [year, month, day] = care.startDate.split('-').map(Number);
  const [hour, minute] = (care.dailyStartTime ?? DefaultCareStartTime).split(':').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 9, minute ?? 0);
}

/**
 * 시작 SharingWindowHours 시간 전. 이때부터 이동을 알리고 간병 시작도 누를 수 있다.
 * 두 가지를 같은 시각에 여는 것은, 일찍 도착한 간병인이 도착은 알렸는데 시작은 못 누르는 틈을 없애기 위해서다.
 */
export function careWindowOpensAt(care: ArrivalMatch['care']): Date {
  return new Date(scheduledStartAt(care).getTime() - SharingWindowHours * 60 * MinuteMs);
}

/**
 * 위치 공유를 쓸 수 있는 시간대인지.
 * 간병 일정과 관련된 시간에만 쓰도록 시작 SharingWindowHours 시간 전부터 연다.
 */
export function isWithinSharingWindow(care: ArrivalMatch['care'], now: Date = new Date()): boolean {
  return now.getTime() >= careWindowOpensAt(care).getTime();
}

/**
 * 간병 시작을 누를 수 있는지. 이동을 알릴 수 있는 시간대와 같다.
 * 날짜만 보면 저녁 간병을 아침에 시작해 둘 수 있어 기록이 실제와 어긋난다.
 */
export function canStartCareAt(care: ArrivalMatch['care'], now: Date = new Date()): boolean {
  return isWithinSharingWindow(care, now);
}

/** 약속한 시작 시각이 지났는지. 노쇼 신고는 이때부터 받는다. */
export function hasScheduledStartPassed(care: ArrivalMatch['care'], now: Date = new Date()): boolean {
  return now.getTime() >= scheduledStartAt(care).getTime();
}

/** '17:00'. 시각을 적지 않은 요청은 '09:00(시각 미정)' — 기준 시각으로 판단했다는 것을 숨기지 않는다. */
export function formatScheduledStart(care: ArrivalMatch['care']): string {
  return care.dailyStartTime ?? `${DefaultCareStartTime}(시각 미정)`;
}

/** 아직 아무것도 하지 않은 매칭의 기록 */
export function emptyLocationSharing(matchId: string): LocationSharing {
  return { matchId, status: 'notStarted', consentGiven: false, mockProgress: 0 };
}

/** 예상 도착 시각을 뺀 기록. 공유가 멈추거나 끝나면 예상 시각은 더 이상 믿을 수 없다. */
export function withoutEstimate(sharing: LocationSharing): LocationSharing {
  const { estimatedArrivalAt: _estimatedArrivalAt, ...rest } = sharing;
  return rest;
}

/** 매칭이 더 이상 "도착을 기다리는" 상태가 아니면 그 이유와 시각 */
function closingOf(match: ArrivalMatch): { reason: LocationSharingEndReason; at?: string } | null {
  switch (match.status) {
    case 'inProgress':
      return { reason: 'careStarted', at: match.startedAt };
    case 'completed':
      return { reason: 'careCompleted', at: match.completedAt };
    case 'cancelled':
      return { reason: 'cancelled', at: match.cancelledAt };
    case 'noShow':
      return { reason: 'noShow', at: match.noShowAt };
    default:
      return null;
  }
}

/**
 * 저장된 기록을 지금 시점에서 읽는다.
 *
 * - 간병이 시작·종료·취소되었거나 노쇼로 신고되었으면 공유는 자동으로 끝난 것이다.
 *   따로 저장하지 않고 매칭 상태에서 판정한다 — 어느 경로로 매칭이 닫혀도(보호자 취소, 관리자 조치 …)
 *   공유가 켜진 채 남는 일이 없다.
 * - 공유 중인데 마지막 업데이트가 오래되었으면 '위치 확인 불가'로 본다.
 */
export function resolveLocationSharing(
  stored: LocationSharing | undefined,
  match: ArrivalMatch,
  now: Date = new Date()
): LocationSharing {
  const base = stored ?? emptyLocationSharing(match.id);
  const closing = closingOf(match);

  if (closing) {
    return {
      ...withoutEstimate(base),
      status: 'ended',
      endedReason: closing.reason,
      stoppedAt: closing.at ?? base.stoppedAt ?? now.toISOString(),
    };
  }

  if (
    (base.status === 'sharing' || base.status === 'nearby') &&
    base.lastUpdatedAt &&
    now.getTime() - new Date(base.lastUpdatedAt).getTime() > StaleUpdateMinutes * MinuteMs
  ) {
    return { ...base, status: 'unavailable' };
  }

  return base;
}

/**
 * 도착 판단.
 *
 * 노쇼를 확정하지 않는다. 시작 시각이 지났는데 이동도 도착도 확인되지 않으면 '확인 필요'까지만 말하고,
 * 매칭 상태는 건드리지 않는다 — 노쇼 신고는 기존대로 보호자가 직접 한다.
 *
 * 시작 시각에 여유 시간을 두지 않는다. 늦을 것 같으면 '도착 지연 가능성'으로 먼저 알리고,
 * 그 판단은 사람에게 맡긴다.
 */
export function assessArrival(
  match: ArrivalMatch,
  sharing: LocationSharing,
  now: Date = new Date()
): ArrivalAssessment {
  if (match.status === 'cancelled' || match.status === 'noShow') {
    return 'cancelled';
  }
  if (sharing.arrivedAt || match.status === 'inProgress' || match.status === 'completed') {
    return 'arrived';
  }

  const start = scheduledStartAt(match.care);
  const hasStartPassed = now.getTime() >= start.getTime();

  switch (sharing.status) {
    case 'sharing':
    case 'nearby': {
      if (hasStartPassed) {
        return 'delayed';
      }
      const estimate = sharing.estimatedArrivalAt ? new Date(sharing.estimatedArrivalAt) : null;
      return estimate && estimate.getTime() > start.getTime() ? 'delayed' : 'moving';
    }
    case 'notStarted':
      if (hasStartPassed) {
        return 'needsConfirmation';
      }
      return isWithinSharingWindow(match.care, now) ? 'preparing' : 'onTime';
    // 멈췄거나, 확인할 수 없거나, 도착 없이 끝냈다
    case 'paused':
    case 'unavailable':
    case 'ended':
    case 'arrived':
      return hasStartPassed ? 'needsConfirmation' : 'preparing';
  }
}

/** 간병인이 스스로 공유를 멈추거나 끝냈는지. 보호자에게 그 사실을 그대로 알린다. */
export function isStoppedByCaregiver(sharing: LocationSharing): boolean {
  return (
    sharing.status === 'paused' ||
    (sharing.status === 'ended' && sharing.endedReason === 'caregiverStopped')
  );
}

/** 지금 시각에서 minutes 분 뒤의 ISO 시각 */
export function minutesFrom(now: Date, minutes: number): string {
  return new Date(now.getTime() + minutes * MinuteMs).toISOString();
}
