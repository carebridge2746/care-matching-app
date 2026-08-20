import { ApiError } from '@/api/api-error';
import type { CareRequestInput, CareRequestsAdapter } from '@/api/care-requests.types';
import { readJson, writeJson } from '@/lib/storage';
import type { CareRequest } from '@/types';

/**
 * 로컬 Mock 간병 요청 저장소.
 *
 * Supabase 프로젝트 없이도 요청 작성 → 목록 확인 → 취소 흐름을 검증하기 위한 구현이다.
 * 저장 위치만 AsyncStorage일 뿐, 화면에서 보이는 동작은 Supabase 구현과 같아야 한다.
 */

const StorageKey = 'careapp.mock.care-requests';
const NetworkDelayMs = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createId(): string {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function loadAll(): Promise<CareRequest[]> {
  return (await readJson<CareRequest[]>(StorageKey)) ?? [];
}

async function saveAll(requests: CareRequest[]): Promise<void> {
  await writeJson(StorageKey, requests);
}

/** 최근에 올린 요청이 위로 오도록 정렬한다 */
function byNewest(a: CareRequest, b: CareRequest): number {
  return b.createdAt.localeCompare(a.createdAt);
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
    createdAt: now,
    updatedAt: now,
  };
}

export const mockCareRequestsAdapter: CareRequestsAdapter = {
  async list(guardianId) {
    await delay(NetworkDelayMs);
    const all = await loadAll();
    return all.filter((request) => request.guardianId === guardianId).sort(byNewest);
  },

  async create(guardianId, input) {
    await delay(NetworkDelayMs);
    const all = await loadAll();
    const request = fromInput(createId(), guardianId, input);
    await saveAll([...all, request]);
    return request;
  },

  async cancel(id) {
    await delay(NetworkDelayMs);
    const all = await loadAll();
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
    await saveAll(all.map((request) => (request.id === id ? cancelled : request)));
    return cancelled;
  },

  async remove(id) {
    await delay(NetworkDelayMs);
    const all = await loadAll();
    const target = all.find((request) => request.id === id);

    if (!target) {
      throw new ApiError('not_found', '요청을 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }
    // 데이터베이스 정책과 같은 규칙이다 — 매칭이 시작된 요청은 지우지 않고 취소로 남긴다
    if (target.status !== 'pending') {
      throw new ApiError('invalid_state', '이미 매칭이 진행된 요청은 삭제할 수 없습니다. 취소만 가능합니다.');
    }

    await saveAll(all.filter((request) => request.id !== id));
  },
};

/**
 * 환자가 지워질 때 그 환자의 요청도 함께 지운다.
 * Supabase 쪽에서는 외래키 cascade 가 같은 일을 한다.
 */
export async function removeMockRequestsForPatient(patientId: string): Promise<void> {
  const all = await loadAll();
  await saveAll(all.filter((request) => request.patientId !== patientId));
}
