import { ApiError } from '@/api/api-error';
import { removeMockRequestsForPatient } from '@/api/care-requests.mock';
import {
  delay,
  loadCareRequests,
  loadMatches,
  loadPatients,
  saveCareRequests,
  savePatients,
} from '@/api/mock-store';
import type { PatientInput, PatientsAdapter } from '@/api/patients.types';
import { AnonymizedPatientName } from '@/lib/privacy';
import { isMatchLive, type Patient } from '@/types';

/**
 * 로컬 Mock 환자 저장소.
 *
 * Supabase 프로젝트 없이도 환자 등록 → 목록 → 삭제 흐름을 검증하기 위한 구현이다.
 * 삭제 규칙(기록이 있으면 익명화)은 Supabase 쪽 remove_patient() 와 같은 답을 내야 한다.
 */

function createId(): string {
  return `pat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 최근에 등록한 환자가 위로 오도록 정렬한다 */
function byNewest(a: Patient, b: Patient): number {
  return b.createdAt.localeCompare(a.createdAt);
}

/** 값이 없는 선택 항목은 아예 넣지 않는다 (undefined 를 그대로 저장하지 않기 위해) */
function applyInput(base: Pick<Patient, 'id' | 'guardianId' | 'createdAt'>, input: PatientInput): Patient {
  return {
    ...base,
    name: input.name.trim(),
    birthYear: input.birthYear,
    gender: input.gender,
    ...(input.relationship?.trim() ? { relationship: input.relationship.trim() } : {}),
    conditions: input.conditions,
    mobility: input.mobility,
    cognition: input.cognition,
    ...(input.careNotes?.trim() ? { careNotes: input.careNotes.trim() } : {}),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 이름·관계·질환·특이사항을 지운다.
 * 출생연도·성별·거동·인지 상태는 남긴다 — 이름이 지워지면 그것만으로 사람을 되짚기 어렵고,
 * 기록을 읽는 화면이 빈 값을 다루지 않아도 된다.
 */
function anonymize(patient: Patient, now: string): Patient {
  const { relationship: _relationship, careNotes: _careNotes, ...rest } = patient;
  return { ...rest, name: AnonymizedPatientName, conditions: [], deletedAt: now, updatedAt: now };
}

async function findLivePatient(id: string): Promise<{ all: Patient[]; target: Patient }> {
  const all = await loadPatients();
  const target = all.find((patient) => patient.id === id && !patient.deletedAt);

  if (!target) {
    throw new ApiError('not_found', '환자 정보를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
  }

  return { all, target };
}

export const mockPatientsAdapter: PatientsAdapter = {
  async list(guardianId) {
    await delay();
    const all = await loadPatients();
    return all
      .filter((patient) => patient.guardianId === guardianId && !patient.deletedAt)
      .sort(byNewest);
  },

  async create(guardianId, input) {
    await delay();
    const all = await loadPatients();
    const patient = applyInput(
      { id: createId(), guardianId, createdAt: new Date().toISOString() },
      input
    );
    await savePatients([...all, patient]);
    return patient;
  },

  async update(id, input) {
    await delay();
    const { all, target } = await findLivePatient(id);

    const updated = applyInput(
      { id: target.id, guardianId: target.guardianId, createdAt: target.createdAt },
      input
    );
    await savePatients(all.map((patient) => (patient.id === id ? updated : patient)));
    return updated;
  },

  async remove(id) {
    await delay();
    const { all } = await findLivePatient(id);

    const requests = (await loadCareRequests()).filter((request) => request.patientId === id);
    const matches = (await loadMatches()).filter((match) =>
      requests.some((request) => request.id === match.requestId)
    );

    // 간병인이 지금 보고 있는 환자 정보가 사라지면 안 된다
    if (matches.some((match) => isMatchLive(match.status))) {
      throw new ApiError(
        'invalid_state',
        '진행 중인 간병이 있어 지금은 환자 정보를 지울 수 없습니다. 간병을 마치거나 취소한 뒤에 지워 주세요.'
      );
    }

    // 기록이 없으면 지금처럼 행째 지운다. 요청도 함께 사라진다.
    if (matches.length === 0) {
      await savePatients(all.filter((patient) => patient.id !== id));
      await removeMockRequestsForPatient(id);
      return 'deleted';
    }

    // 기록이 있으면 행은 두고 익명화한다. 기록이 없는 요청은 지우고,
    // 기록이 있는데 아직 대기중인 요청은 다시 매칭되지 않도록 취소로 닫는다.
    const now = new Date().toISOString();
    const requestIdsWithHistory = new Set(matches.map((match) => match.requestId));

    await saveCareRequests(
      (await loadCareRequests()).flatMap((request) => {
        if (request.patientId !== id) {
          return [request];
        }
        if (!requestIdsWithHistory.has(request.id)) {
          return [];
        }
        return [
          request.status === 'pending'
            ? { ...request, status: 'cancelled' as const, updatedAt: now }
            : request,
        ];
      })
    );
    await savePatients(all.map((patient) => (patient.id === id ? anonymize(patient, now) : patient)));

    return 'anonymized';
  },
};
