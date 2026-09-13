import { ApiError } from '@/api/api-error';
import { readMockUsers } from '@/api/auth.mock';
import type { MatchHistoryAdapter } from '@/api/match-history.types';
import {
  delay,
  loadCareRequests,
  loadMatches,
  loadPatients,
  saveCareRequests,
  saveMatches,
} from '@/api/mock-store';
import { formatKoreanDate, today } from '@/lib/date';
import { maskPersonName } from '@/lib/privacy';
import {
  isMatchLive,
  type AppUser,
  type CareMatch,
  type CareRequest,
  type Match,
  type MatchCareSummary,
  type MatchContact,
  type MatchedPatient,
  type Patient,
} from '@/types';

/**
 * 로컬 Mock 매칭 이력 저장소.
 *
 * Supabase 쪽에서 match_details 뷰와 세 함수(start_care/complete_care/cancel_match)가
 * 하는 일을 여기서 그대로 한다. 특히 두 가지는 양쪽 구현이 반드시 같은 답을 내야 한다.
 *   - 무엇이 보이는가: 취소된 매칭은 연락처와 특이사항을 다시 가린다
 *   - 요청이 어떻게 되는가: 시작 전 취소는 요청을 다시 대기중으로 돌리고,
 *     시작한 뒤의 취소는 요청도 함께 닫는다
 */

/** 최근에 수락한 매칭이 위로 오도록 정렬한다 */
function byRecentlyAccepted(a: Match, b: Match): number {
  return b.acceptedAt.localeCompare(a.acceptedAt);
}

function toCareSummary(request: CareRequest): MatchCareSummary {
  return {
    requestText: request.requestText,
    careType: request.careType,
    region: request.region,
    startDate: request.startDate,
    ...(request.endDate ? { endDate: request.endDate } : {}),
    ...(request.dailyStartTime ? { dailyStartTime: request.dailyStartTime } : {}),
    ...(request.dailyEndTime ? { dailyEndTime: request.dailyEndTime } : {}),
    requiredSkills: request.requiredSkills,
    ...(request.budgetPerDay !== undefined ? { budgetPerDay: request.budgetPerDay } : {}),
  };
}

/**
 * 이름과 연락처를 볼 수 있는지 정한다.
 *
 * 자기 자신의 정보는 언제나 보이고, 상대방은 매칭이 성사되어 있는 동안에만 열린다.
 * 취소된 매칭에서 상대의 이름을 가리는 것은 수락 전에 환자 이름을 가리는 것과 같은 규칙이다 —
 * 성사되지 않은 만남의 연락처를 이력이라는 이유로 계속 열어 둘 까닭이 없다.
 */
function toContact(user: AppUser | undefined, isOpen: boolean): MatchContact {
  const name = user?.name ?? '알 수 없음';

  return {
    name: isOpen ? name : maskPersonName(name),
    ...(isOpen && user?.phone ? { phone: user.phone } : {}),
  };
}

function toPatientSummary(patient: Patient, isOpen: boolean): MatchedPatient {
  return {
    name: isOpen ? patient.name : maskPersonName(patient.name),
    birthYear: patient.birthYear,
    gender: patient.gender,
    mobility: patient.mobility,
    cognition: patient.cognition,
    conditions: patient.conditions,
    // 환자 특이사항은 매칭이 성사된 뒤에야 간병인에게 열린다
    ...(isOpen && patient.careNotes ? { careNotes: patient.careNotes } : {}),
  };
}

function toCareMatch(
  match: Match,
  request: CareRequest,
  patient: Patient,
  users: AppUser[],
  viewerId: string
): CareMatch {
  // 취소된 매칭과 오지 않은 매칭은 만남이 성사되지 않은 것이다. 연락처를 다시 가린다.
  const engaged = match.status !== 'cancelled' && match.status !== 'noShow';

  return {
    ...match,
    care: toCareSummary(request),
    patient: toPatientSummary(patient, viewerId === match.guardianId || engaged),
    caregiver: toContact(
      users.find((user) => user.id === match.caregiverId),
      viewerId === match.caregiverId || engaged
    ),
    guardian: toContact(
      users.find((user) => user.id === match.guardianId),
      viewerId === match.guardianId || engaged
    ),
  };
}

/**
 * 매칭 목록에 요청·환자·사람을 이어 붙인다.
 * 요청이나 환자가 사라진 매칭은 화면에 띄우지 않는다 — Supabase 쪽에서는 조인이 같은 일을 한다.
 */
async function withDetails(matches: Match[], viewerId: string): Promise<CareMatch[]> {
  const [requests, patients, users] = await Promise.all([
    loadCareRequests(),
    loadPatients(),
    readMockUsers(),
  ]);

  return matches.flatMap((match) => {
    const request = requests.find((item) => item.id === match.requestId);
    const patient = request && patients.find((item) => item.id === request.patientId);

    return request && patient ? [toCareMatch(match, request, patient, users, viewerId)] : [];
  });
}

/** 상태를 옮긴 뒤 화면이 그대로 쓸 수 있는 모양으로 돌려준다 */
async function saveAndRead(
  matches: Match[],
  updated: Match,
  viewerId: string
): Promise<CareMatch> {
  await saveMatches(matches.map((item) => (item.id === updated.id ? updated : item)));

  const [detail] = await withDetails([updated], viewerId);
  if (!detail) {
    throw new ApiError('not_found', '간병 정보를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
  }

  return detail;
}

/** 요청 상태를 매칭 상태에 맞춰 옮긴다. Supabase 쪽에서는 같은 함수 안에서 함께 바뀐다. */
async function moveRequest(
  requestId: string,
  change: (request: CareRequest) => CareRequest
): Promise<void> {
  const requests = await loadCareRequests();
  await saveCareRequests(
    requests.map((request) => (request.id === requestId ? change(request) : request))
  );
}

/** 세 메서드가 똑같이 하는 일 — 매칭을 찾고, 당사자가 부른 것인지 확인한다 */
async function readOwnMatch(
  matchId: string,
  actorId: string
): Promise<{ matches: Match[]; match: Match }> {
  const matches = await loadMatches();
  const match = matches.find((item) => item.id === matchId);

  if (!match) {
    throw new ApiError('not_found', '간병 정보를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
  }
  // 당사자가 아닌 사람에게는 "없다"고 답한다. 있다고 알려 주면 남의 매칭 존재 여부가 새어 나간다.
  if (match.caregiverId !== actorId && match.guardianId !== actorId) {
    throw new ApiError('not_found', '간병 정보를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
  }

  return { matches, match };
}

export const mockMatchHistoryAdapter: MatchHistoryAdapter = {
  async listForGuardian(guardianId) {
    await delay();
    const matches = await loadMatches();
    return withDetails(
      matches.filter((match) => match.guardianId === guardianId).sort(byRecentlyAccepted),
      guardianId
    );
  },

  async listForCaregiver(caregiverId) {
    await delay();
    const matches = await loadMatches();
    return withDetails(
      matches.filter((match) => match.caregiverId === caregiverId).sort(byRecentlyAccepted),
      caregiverId
    );
  },

  async start(matchId, caregiverId) {
    await delay();
    const { matches, match } = await readOwnMatch(matchId, caregiverId);

    // 출근한 사람이 누르는 버튼이다. 보호자는 대신 눌러 줄 수 없다.
    if (match.caregiverId !== caregiverId) {
      throw new ApiError('permission_denied', '간병인만 간병을 시작할 수 있습니다.');
    }
    if (match.status !== 'accepted') {
      throw new ApiError('invalid_state', '이미 시작했거나 끝난 간병입니다. 목록을 새로 불러와 주세요.');
    }

    // 시작일 전에는 시작할 수 없다. 막지 않으면 "9월 14일부터"인 간병이 13일에 시작·종료되어
    // 기간과 기록이 서로 어긋난다. Supabase 쪽에서는 start_care() 가 같은 조건을 건다.
    const request = (await loadCareRequests()).find((item) => item.id === match.requestId);
    if (request && request.startDate > today()) {
      throw new ApiError(
        'invalid_state',
        `${formatKoreanDate(request.startDate)}부터 간병을 시작할 수 있습니다.`
      );
    }

    const now = new Date().toISOString();
    const started: Match = { ...match, status: 'inProgress', startedAt: now, updatedAt: now };

    await moveRequest(match.requestId, (request) => ({
      ...request,
      status: 'inProgress',
      updatedAt: now,
    }));

    return saveAndRead(matches, started, caregiverId);
  },

  async complete(matchId, actorId) {
    await delay();
    const { matches, match } = await readOwnMatch(matchId, actorId);

    if (match.status !== 'inProgress') {
      throw new ApiError(
        'invalid_state',
        '진행중인 간병만 종료할 수 있습니다. 목록을 새로 불러와 주세요.'
      );
    }

    const now = new Date().toISOString();
    const finished: Match = { ...match, status: 'completed', completedAt: now, updatedAt: now };

    await moveRequest(match.requestId, (request) => ({
      ...request,
      status: 'completed',
      updatedAt: now,
    }));

    return saveAndRead(matches, finished, actorId);
  },

  async cancel(matchId, actorId, reason) {
    await delay();
    const { matches, match } = await readOwnMatch(matchId, actorId);

    if (!isMatchLive(match.status)) {
      throw new ApiError('invalid_state', '이미 끝났거나 취소된 간병입니다.');
    }

    const now = new Date().toISOString();
    const wasStarted = Boolean(match.startedAt);
    const trimmedReason = reason?.trim();

    const cancelled: Match = {
      ...match,
      status: 'cancelled',
      cancelledAt: now,
      cancelledBy: match.caregiverId === actorId ? 'caregiver' : 'guardian',
      ...(trimmedReason ? { cancelReason: trimmedReason } : {}),
      updatedAt: now,
    };

    await moveRequest(match.requestId, (request) => {
      // 시작한 뒤에 끊긴 간병은 요청도 함께 닫는다.
      // 아직 시작하지 않았다면 요청을 다시 열어 다른 간병인이 수락할 수 있게 한다.
      if (wasStarted) {
        return { ...request, status: 'cancelled', updatedAt: now };
      }

      const { matchedCaregiverId: _caregiverId, matchedAt: _matchedAt, ...rest } = request;
      return { ...rest, status: 'pending', updatedAt: now };
    });

    return saveAndRead(matches, cancelled, actorId);
  },

  async reportNoShow(matchId, guardianId, note) {
    await delay();
    const { matches, match } = await readOwnMatch(matchId, guardianId);

    // 오지 않았다는 것을 아는 사람은 그 자리에 있던 보호자뿐이다
    if (match.guardianId !== guardianId) {
      throw new ApiError('permission_denied', '보호자만 노쇼를 신고할 수 있습니다.');
    }
    if (match.status !== 'accepted') {
      throw new ApiError(
        'invalid_state',
        '아직 시작되지 않은 간병만 신고할 수 있습니다. 목록을 새로 불러와 주세요.'
      );
    }

    const requests = await loadCareRequests();
    const request = requests.find((item) => item.id === match.requestId);

    if (!request) {
      throw new ApiError('not_found', '간병 정보를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }
    // 아직 오지 않은 날짜의 간병을 미리 신고할 수는 없다
    if (request.startDate > today()) {
      throw new ApiError('invalid_state', '간병 시작일이 지나야 신고할 수 있습니다.');
    }

    const now = new Date().toISOString();
    const trimmedNote = note?.trim();

    const reported: Match = {
      ...match,
      status: 'noShow',
      noShowAt: now,
      ...(trimmedNote ? { noShowNote: trimmedNote } : {}),
      updatedAt: now,
    };

    // 요청은 곧바로 다시 대기중이 된다. 사람이 필요한 상황은 그대로이고,
    // 여기서 요청을 닫아 두면 가장 급한 순간에 아무 간병인도 이 요청을 볼 수 없다.
    await moveRequest(match.requestId, (item) => {
      const { matchedCaregiverId: _caregiverId, matchedAt: _matchedAt, ...rest } = item;
      return { ...rest, status: 'pending', updatedAt: now };
    });

    return saveAndRead(matches, reported, guardianId);
  },
};

/**
 * 이 간병인이 이 요청에서 노쇼로 신고된 적이 있는지.
 *
 * 요청 수락(care-requests.mock)과 추천 목록(matching.mock)이 함께 쓴다.
 * 오지 않은 사람이 같은 요청을 다시 가져가거나 다시 추천되면, 보호자는 같은 일을
 * 한 번 더 겪게 된다. Supabase 쪽에서는 accept_care_request() 와
 * recommendation_candidates() 가 같은 조건을 건다.
 */
export async function hasMockNoShow(requestId: string, caregiverId: string): Promise<boolean> {
  const matches = await loadMatches();

  return matches.some(
    (match) =>
      match.requestId === requestId &&
      match.caregiverId === caregiverId &&
      match.status === 'noShow'
  );
}

/** 이 요청에서 노쇼로 신고된 간병인들 */
export async function mockNoShowCaregiverIds(requestId: string): Promise<string[]> {
  const matches = await loadMatches();

  return matches
    .filter((match) => match.requestId === requestId && match.status === 'noShow')
    .map((match) => match.caregiverId);
}

/**
 * 간병인이 요청을 수락할 때 매칭 행을 만든다.
 *
 * 요청 수락은 care-requests.mock 이 맡고 있으므로 그쪽에서 부른다.
 * Supabase 모드에서는 accept_care_request() 안에서 같은 일이 한 트랜잭션으로 일어난다.
 */
export async function createMockMatch(
  request: CareRequest,
  caregiverId: string,
  acceptedAt: string
): Promise<void> {
  const matches = await loadMatches();

  const match: Match = {
    id: `match-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    requestId: request.id,
    guardianId: request.guardianId,
    caregiverId,
    status: 'accepted',
    acceptedAt,
    createdAt: acceptedAt,
    updatedAt: acceptedAt,
  };

  await saveMatches([...matches, match]);
}

/**
 * 보호자가 요청을 거두거나 요청이 사라질 때, 살아 있는 매칭을 함께 정리한다.
 *
 * Supabase 쪽에서는 요청이 지워지면 외래키 cascade 가 매칭 행까지 지운다.
 * 요청을 취소만 한 경우에는 취소 기록이 남아야 하므로 지우지 않고 cancelled 로 남긴다.
 */
export async function cancelMockMatchesForRequest(
  requestId: string,
  cancelledBy: string
): Promise<void> {
  const matches = await loadMatches();
  const now = new Date().toISOString();

  await saveMatches(
    matches.map((match) =>
      match.requestId === requestId && (match.status === 'accepted' || match.status === 'inProgress')
        ? {
            ...match,
            status: 'cancelled',
            cancelledAt: now,
            cancelledBy: match.caregiverId === cancelledBy ? 'caregiver' : 'guardian',
            cancelReason: '보호자가 요청을 취소했습니다.',
            updatedAt: now,
          }
        : match
    )
  );
}

/** 요청 자체가 지워질 때 매칭도 함께 지운다 (Supabase 의 cascade 와 같은 일) */
export async function removeMockMatchesForRequests(requestIds: string[]): Promise<void> {
  const matches = await loadMatches();
  await saveMatches(matches.filter((match) => !requestIds.includes(match.requestId)));
}
