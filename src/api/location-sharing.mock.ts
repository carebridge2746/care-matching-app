import { ApiError } from '@/api/api-error';
import { readMockUsers } from '@/api/auth.mock';
import type { LocationSharingAdapter } from '@/api/location-sharing.types';
import {
  delay,
  loadCareRequests,
  loadLocationSharings,
  loadMatches,
  saveLocationSharings,
} from '@/api/mock-store';
import {
  assessArrival,
  isWithinSharingWindow,
  minutesFrom,
  MockNearbyMinutes,
  MockTravelMinutes,
  resolveLocationSharing,
  scheduledStartAt,
  SharingWindowHours,
  withoutEstimate,
  type ArrivalMatch,
} from '@/lib/arrival';
import type { ArrivalAssessment, ArrivalWatchItem, CareRequest, LocationSharing, Match } from '@/types';

/**
 * 로컬 Mock 안심 도착 저장소 (Phase 13).
 *
 * 실제 위치를 받지 않는다. 간병인이 누른 상태와 시각만 저장하고, 예상 도착 시각은
 * 정해진 분을 더해 만든다(MockTravelMinutes · MockNearbyMinutes).
 *
 * TODO(실제 위치): 기기 위치 권한과 이동 시간 계산을 붙이면, 간병인이 버튼을 누르는 대신
 * 앱이 주기적으로 진행도와 예상 시각을 올린다. 그때도 좌표 자체는 보호자에게 내려보내지 않는다.
 */

type Context = {
  match: Match;
  arrivalMatch: ArrivalMatch;
  records: LocationSharing[];
  stored: LocationSharing | undefined;
};

function toArrivalMatch(match: Match, request: CareRequest): ArrivalMatch {
  return {
    ...match,
    care: {
      startDate: request.startDate,
      ...(request.dailyStartTime ? { dailyStartTime: request.dailyStartTime } : {}),
    },
  };
}

async function readContext(matchId: string, caregiverId: string): Promise<Context> {
  const [matches, requests, records] = await Promise.all([
    loadMatches(),
    loadCareRequests(),
    loadLocationSharings(),
  ]);
  const match = matches.find((item) => item.id === matchId);
  const request = match && requests.find((item) => item.id === match.requestId);

  // 당사자 간병인이 아니면 없다고 답한다. 남의 매칭 존재 여부를 알려 주지 않는다.
  if (!match || !request || match.caregiverId !== caregiverId) {
    throw new ApiError('not_found', '간병 정보를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
  }

  return {
    match,
    arrivalMatch: toArrivalMatch(match, request),
    records,
    stored: records.find((item) => item.matchId === matchId),
  };
}

/**
 * 상태를 바꾸는 여섯 동작이 똑같이 하는 일.
 * 지금 상태를 읽고, 바꿀 수 있는지 확인하고, 저장한 뒤 다시 읽어서 돌려준다.
 */
async function change(
  matchId: string,
  caregiverId: string,
  apply: (current: LocationSharing, context: Context, now: Date) => LocationSharing
): Promise<LocationSharing> {
  await delay();
  const context = await readContext(matchId, caregiverId);
  const now = new Date();

  // 간병이 시작·종료·취소되었으면 공유는 이미 끝났다. 다시 켤 수 없다.
  if (context.match.status !== 'accepted') {
    throw new ApiError(
      'invalid_state',
      '이미 시작했거나 끝난 간병이라 위치 공유를 바꿀 수 없습니다. 목록을 새로 불러와 주세요.'
    );
  }

  const current = resolveLocationSharing(context.stored, context.arrivalMatch, now);
  const next = apply(current, context, now);

  await saveLocationSharings([
    ...context.records.filter((item) => item.matchId !== matchId),
    next,
  ]);

  return resolveLocationSharing(next, context.arrivalMatch, now);
}

function reject(message: string): never {
  throw new ApiError('invalid_state', message);
}

/** 급한 것이 위로: 확인 필요 → 지연 가능성 → 나머지 */
const AssessmentOrder: Record<ArrivalAssessment, number> = {
  needsConfirmation: 0,
  delayed: 1,
  preparing: 2,
  moving: 3,
  onTime: 4,
  arrived: 5,
  cancelled: 6,
};

export const mockLocationSharingAdapter: LocationSharingAdapter = {
  async listForMatches(matchIds) {
    await delay();
    const [matches, requests, records] = await Promise.all([
      loadMatches(),
      loadCareRequests(),
      loadLocationSharings(),
    ]);
    const now = new Date();

    return matchIds.flatMap((matchId) => {
      const match = matches.find((item) => item.id === matchId);
      const request = match && requests.find((item) => item.id === match.requestId);
      if (!match || !request) {
        return [];
      }
      return [
        resolveLocationSharing(
          records.find((item) => item.matchId === matchId),
          toArrivalMatch(match, request),
          now
        ),
      ];
    });
  },

  giveConsent: (matchId, caregiverId) =>
    change(matchId, caregiverId, (current, _context, now) => ({
      ...current,
      consentGiven: true,
      consentAt: current.consentAt ?? now.toISOString(),
    })),

  start: (matchId, caregiverId) =>
    change(matchId, caregiverId, (current, context, now) => {
      if (!current.consentGiven) {
        reject('위치 공유 안내에 동의해야 이동을 시작할 수 있습니다.');
      }
      if (!isWithinSharingWindow(context.arrivalMatch.care, now)) {
        reject(`간병 시작 ${SharingWindowHours}시간 전부터 이동을 알릴 수 있습니다.`);
      }
      // 처음 시작하거나, 스스로 끝냈던 공유를 다시 시작하는 경우만 받는다
      const canStart =
        current.status === 'notStarted' ||
        (current.status === 'ended' && current.endedReason === 'caregiverStopped');
      if (!canStart) {
        reject('이미 이동을 알렸거나 도착한 간병입니다. 목록을 새로 불러와 주세요.');
      }

      const { endedReason: _endedReason, stoppedAt: _stoppedAt, ...rest } = current;
      return {
        ...rest,
        status: 'sharing',
        startedAt: current.startedAt ?? now.toISOString(),
        lastUpdatedAt: now.toISOString(),
        estimatedArrivalAt: minutesFrom(now, MockTravelMinutes),
        mockProgress: Math.max(current.mockProgress, 10),
      };
    }),

  markNearby: (matchId, caregiverId) =>
    change(matchId, caregiverId, (current, _context, now) => {
      if (current.status !== 'sharing' && current.status !== 'unavailable') {
        reject('이동 중일 때만 인근에 왔다고 알릴 수 있습니다.');
      }
      return {
        ...current,
        status: 'nearby',
        lastUpdatedAt: now.toISOString(),
        estimatedArrivalAt: minutesFrom(now, MockNearbyMinutes),
        mockProgress: Math.max(current.mockProgress, 80),
      };
    }),

  markArrived: (matchId, caregiverId) =>
    change(matchId, caregiverId, (current, _context, now) => {
      if (current.status === 'arrived') {
        reject('이미 도착 완료로 알린 간병입니다.');
      }
      const { endedReason: _endedReason, stoppedAt: _stoppedAt, ...rest } = withoutEstimate(current);
      return {
        ...rest,
        status: 'arrived',
        arrivedAt: now.toISOString(),
        lastUpdatedAt: now.toISOString(),
        mockProgress: 100,
      };
    }),

  pause: (matchId, caregiverId) =>
    change(matchId, caregiverId, (current, _context, now) => {
      if (current.status !== 'sharing' && current.status !== 'nearby' && current.status !== 'unavailable') {
        reject('공유 중일 때만 일시 중지할 수 있습니다.');
      }
      return {
        ...withoutEstimate(current),
        status: 'paused',
        stoppedAt: now.toISOString(),
        lastUpdatedAt: now.toISOString(),
      };
    }),

  resume: (matchId, caregiverId) =>
    change(matchId, caregiverId, (current, _context, now) => {
      if (current.status !== 'paused') {
        reject('일시 중지한 공유만 다시 켤 수 있습니다.');
      }
      // 인근까지 왔다가 멈췄다면 인근으로 되돌린다
      const isNearby = current.mockProgress >= 80;
      const { stoppedAt: _stoppedAt, ...rest } = current;
      return {
        ...rest,
        status: isNearby ? 'nearby' : 'sharing',
        lastUpdatedAt: now.toISOString(),
        estimatedArrivalAt: minutesFrom(now, isNearby ? MockNearbyMinutes : MockTravelMinutes),
      };
    }),

  stop: (matchId, caregiverId) =>
    change(matchId, caregiverId, (current, _context, now) => {
      const isSharing =
        current.status === 'sharing' ||
        current.status === 'nearby' ||
        current.status === 'paused' ||
        current.status === 'unavailable';
      if (!isSharing) {
        reject('공유 중이 아니라 종료할 것이 없습니다.');
      }
      return {
        ...withoutEstimate(current),
        status: 'ended',
        endedReason: 'caregiverStopped',
        stoppedAt: now.toISOString(),
        lastUpdatedAt: now.toISOString(),
      };
    }),

  async listArrivalWatch() {
    await delay();
    const [matches, requests, records, users] = await Promise.all([
      loadMatches(),
      loadCareRequests(),
      loadLocationSharings(),
      readMockUsers(),
    ]);
    const now = new Date();
    const nameOf = (id: string) => users.find((user) => user.id === id)?.name ?? '알 수 없음';

    return matches
      .flatMap((match): (ArrivalWatchItem & { startsAt: number })[] => {
        const request = requests.find((item) => item.id === match.requestId);
        if (match.status !== 'accepted' || !request) {
          return [];
        }
        const arrivalMatch = toArrivalMatch(match, request);
        if (!isWithinSharingWindow(arrivalMatch.care, now)) {
          return [];
        }
        const sharing = resolveLocationSharing(
          records.find((item) => item.matchId === match.id),
          arrivalMatch,
          now
        );
        return [
          {
            matchId: match.id,
            requestId: match.requestId,
            region: request.region,
            startDate: request.startDate,
            ...(request.dailyStartTime ? { dailyStartTime: request.dailyStartTime } : {}),
            guardianName: nameOf(match.guardianId),
            caregiverName: nameOf(match.caregiverId),
            sharing,
            assessment: assessArrival(arrivalMatch, sharing, now),
            startsAt: scheduledStartAt(arrivalMatch.care).getTime(),
          },
        ];
      })
      .sort(
        (a, b) =>
          AssessmentOrder[a.assessment] - AssessmentOrder[b.assessment] || a.startsAt - b.startsAt
      )
      .map(({ startsAt: _startsAt, ...item }) => item);
  },
};
