import { ApiError } from '@/api/api-error';
import type { CareRequestInput, CareRequestsAdapter } from '@/api/care-requests.types';
import {
  cancelMockMatchesForRequest,
  createMockMatch,
  hasMockNoShow,
  removeMockMatchesForRequests,
} from '@/api/match-history.mock';
import { delay, loadCareRequests, loadPatients, saveCareRequests } from '@/api/mock-store';
import { maskPersonName } from '@/lib/privacy';
import type { CareRequest, CaregiverCareRequest, Patient, PatientSummary } from '@/types';

/**
 * 로컬 Mock 간병 요청 저장소.
 *
 * Supabase 프로젝트 없이도 보호자의 요청 작성 → 간병인의 수락까지 검증하기 위한 구현이다.
 * 저장 위치만 AsyncStorage일 뿐, 화면에서 보이는 동작은 Supabase 구현과 같아야 한다.
 * 특히 "환자 이름을 언제 공개하는가"와 "이미 매칭된 요청은 수락할 수 없다"는
 * 두 규칙은 양쪽 구현이 반드시 같은 답을 내야 한다.
 */

function createId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 최근에 올린 요청이 위로 오도록 정렬한다 */
function byNewest(a: CareRequest, b: CareRequest): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/** 나중에 수락한 요청이 위로 오도록 정렬한다 */
function byRecentlyMatched(a: CareRequest, b: CareRequest): number {
  return (b.matchedAt ?? b.updatedAt).localeCompare(a.matchedAt ?? a.updatedAt);
}

/** 값이 없는 선택 항목은 아예 넣지 않는다 (undefined 를 그대로 저장하지 않기 위해) */
function fromInput(id: string, guardianId: string, input: CareRequestInput): CareRequest {
  const now = new Date().toISOString();

  return {
    id,
    guardianId,
    patientId: input.patientId,
    requestText: input.requestText.trim(),
    careType: input.careType,
    region: input.region.trim(),
    startDate: input.startDate,
    ...(input.endDate ? { endDate: input.endDate } : {}),
    ...(input.dailyStartTime ? { dailyStartTime: input.dailyStartTime } : {}),
    ...(input.dailyEndTime ? { dailyEndTime: input.dailyEndTime } : {}),
    requiredSkills: input.requiredSkills,
    preferredCaregiverGender: input.preferredCaregiverGender,
    ...(input.budgetPerDay !== undefined ? { budgetPerDay: input.budgetPerDay } : {}),
    status: 'pending',
    // AI 정리 결과는 요청과 함께 한 번만 저장한다. 나중에 다시 정리하려면 새 값을 덮어쓴다.
    ...(input.aiConditions ? { aiConditions: input.aiConditions, aiAnalyzedAt: now } : {}),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 요청에 환자 요약을 붙여 간병인이 볼 형태로 바꾼다.
 *
 * 보호자 식별자와 환자 식별자는 떼어 낸다.
 * 환자 이름은 이 요청을 수락한 간병인에게만 그대로 보여 주고, 그 전에는 성만 남긴다.
 */
function toCaregiverRequest(
  request: CareRequest,
  patient: Patient,
  caregiverId: string
): CaregiverCareRequest {
  const { guardianId: _guardianId, patientId: _patientId, ...rest } = request;

  const isMine = request.matchedCaregiverId === caregiverId;
  const summary: PatientSummary = {
    name: isMine ? patient.name : maskPersonName(patient.name),
    birthYear: patient.birthYear,
    gender: patient.gender,
    mobility: patient.mobility,
    cognition: patient.cognition,
    conditions: patient.conditions,
  };

  return { ...rest, patient: summary };
}

/**
 * 요청 목록에 환자를 이어 붙인다.
 * 환자가 사라진 요청은 화면에 띄우지 않는다 — Supabase 쪽에서는 조인이 같은 일을 한다.
 */
async function withPatients(
  requests: CareRequest[],
  caregiverId: string
): Promise<CaregiverCareRequest[]> {
  const patients = await loadPatients();

  return requests.flatMap((request) => {
    const patient = patients.find((item) => item.id === request.patientId);
    return patient ? [toCaregiverRequest(request, patient, caregiverId)] : [];
  });
}

export const mockCareRequestsAdapter: CareRequestsAdapter = {
  async list(guardianId) {
    await delay();
    const all = await loadCareRequests();
    return all.filter((request) => request.guardianId === guardianId).sort(byNewest);
  },

  async create(guardianId, input) {
    await delay();
    const all = await loadCareRequests();
    const request = fromInput(createId(), guardianId, input);
    await saveCareRequests([...all, request]);
    return request;
  },

  async cancel(id) {
    await delay();
    const all = await loadCareRequests();
    const target = all.find((request) => request.id === id);

    if (!target) {
      throw new ApiError('not_found', '요청을 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }
    if (target.status === 'completed' || target.status === 'cancelled') {
      throw new ApiError('invalid_state', '이미 끝났거나 취소된 요청입니다.');
    }

    const cancelled: CareRequest = {
      ...target,
      status: 'cancelled',
      updatedAt: new Date().toISOString(),
    };
    await saveCareRequests(all.map((request) => (request.id === id ? cancelled : request)));
    // 이미 간병인이 붙어 있었다면 그 매칭도 함께 끝난다. 기록은 취소 이력으로 남긴다.
    await cancelMockMatchesForRequest(id, target.guardianId);
    return cancelled;
  },

  async remove(id) {
    await delay();
    const all = await loadCareRequests();
    const target = all.find((request) => request.id === id);

    if (!target) {
      throw new ApiError('not_found', '요청을 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }
    // 데이터베이스 정책과 같은 규칙이다 — 매칭이 시작된 요청은 지우지 않고 취소로 남긴다
    if (target.status !== 'pending') {
      throw new ApiError('invalid_state', '이미 매칭이 진행된 요청은 삭제할 수 없습니다. 취소만 가능합니다.');
    }

    await saveCareRequests(all.filter((request) => request.id !== id));
    // 대기중 요청에도 지난 매칭 이력이 붙어 있을 수 있다 (수락됐다가 시작 전에 취소된 경우).
    // Supabase 쪽에서는 외래키 cascade 가 같은 일을 한다.
    await removeMockMatchesForRequests([id]);
  },

  async listAvailable(caregiverId) {
    await delay();
    const all = await loadCareRequests();
    const pending = all.filter((request) => request.status === 'pending').sort(byNewest);
    return withPatients(pending, caregiverId);
  },

  async listAccepted(caregiverId) {
    await delay();
    const all = await loadCareRequests();
    const mine = all
      .filter((request) => request.matchedCaregiverId === caregiverId)
      .sort(byRecentlyMatched);
    return withPatients(mine, caregiverId);
  },

  async accept(id, caregiverId) {
    await delay();
    const all = await loadCareRequests();
    const target = all.find((request) => request.id === id);

    if (!target) {
      throw new ApiError('not_found', '요청을 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }
    // 먼저 수락한 간병인이 가져간다. 목록을 띄워 둔 사이에 상태가 바뀌었을 수 있다.
    if (target.status !== 'pending') {
      throw new ApiError(
        'invalid_state',
        '이미 다른 간병인이 수락했거나 보호자가 취소한 요청입니다. 목록을 새로 불러와 주세요.'
      );
    }
    // 노쇼로 신고되면 요청은 곧바로 다시 대기중이 된다. 막지 않으면 오지 않았던 사람이
    // 그 요청을 다시 가져갈 수 있고, 보호자는 같은 일을 한 번 더 겪게 된다.
    if (await hasMockNoShow(id, caregiverId)) {
      throw new ApiError(
        'invalid_state',
        '이 요청에서 오지 않으신 것으로 신고되어 다시 수락하실 수 없습니다.'
      );
    }

    const now = new Date().toISOString();
    const matched: CareRequest = {
      ...target,
      status: 'matched',
      matchedCaregiverId: caregiverId,
      matchedAt: now,
      updatedAt: now,
    };
    await saveCareRequests(all.map((request) => (request.id === id ? matched : request)));
    // 수락과 매칭 기록은 함께 남아야 한다.
    // Supabase 쪽에서는 accept_care_request() 안에서 한 트랜잭션으로 일어난다.
    await createMockMatch(matched, caregiverId, now);

    const patients = await loadPatients();
    const patient = patients.find((item) => item.id === matched.patientId);

    if (!patient) {
      throw new ApiError('not_found', '환자 정보를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }

    return toCaregiverRequest(matched, patient, caregiverId);
  },
};

/**
 * 환자가 지워질 때 그 환자의 요청도 함께 지운다.
 * Supabase 쪽에서는 외래키 cascade 가 같은 일을 한다.
 */
export async function removeMockRequestsForPatient(patientId: string): Promise<void> {
  const all = await loadCareRequests();
  const removed = all.filter((request) => request.patientId === patientId);

  await saveCareRequests(all.filter((request) => request.patientId !== patientId));
  // 요청이 사라지면 그 요청에 달린 매칭 기록도 함께 사라진다
  await removeMockMatchesForRequests(removed.map((request) => request.id));
}
