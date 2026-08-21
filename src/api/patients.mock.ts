import { ApiError } from '@/api/api-error';
import { removeMockRequestsForPatient } from '@/api/care-requests.mock';
import { delay, loadPatients, savePatients } from '@/api/mock-store';
import type { PatientInput, PatientsAdapter } from '@/api/patients.types';
import type { Patient } from '@/types';

/**
 * 로컬 Mock 환자 저장소.
 *
 * Supabase 프로젝트 없이도 환자 등록 → 목록 → 삭제 흐름을 검증하기 위한 구현이다.
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

export const mockPatientsAdapter: PatientsAdapter = {
  async list(guardianId) {
    await delay();
    const all = await loadPatients();
    return all.filter((patient) => patient.guardianId === guardianId).sort(byNewest);
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
    const all = await loadPatients();
    const target = all.find((patient) => patient.id === id);

    if (!target) {
      throw new ApiError('not_found', '환자 정보를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }

    const updated = applyInput(
      { id: target.id, guardianId: target.guardianId, createdAt: target.createdAt },
      input
    );
    await savePatients(all.map((patient) => (patient.id === id ? updated : patient)));
    return updated;
  },

  async remove(id) {
    await delay();
    const all = await loadPatients();

    if (!all.some((patient) => patient.id === id)) {
      throw new ApiError('not_found', '환자 정보를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }

    await savePatients(all.filter((patient) => patient.id !== id));
    // 데이터베이스의 외래키 cascade 와 같은 동작을 흉내 낸다
    await removeMockRequestsForPatient(id);
  },
};
