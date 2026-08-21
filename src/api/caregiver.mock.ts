import { ApiError } from '@/api/api-error';
import { DemoCaregiverProfiles } from '@/api/caregiver.demo';
import type { CaregiverAdapter, CaregiverProfileInput } from '@/api/caregiver.types';
import { delay, loadCaregiverProfiles, saveCaregiverProfiles } from '@/api/mock-store';
import { sortSlots } from '@/lib/availability';
import type { CaregiverProfile } from '@/types';

/**
 * 로컬 Mock 간병인 프로필 저장소.
 *
 * Supabase 프로젝트 없이도 프로필 등록 → 가능 시간 설정 흐름을 검증하기 위한 구현이다.
 * 저장 위치만 AsyncStorage일 뿐, 화면에서 보이는 동작은 Supabase 구현과 같아야 한다.
 */

/** 값이 없는 선택 항목은 아예 넣지 않는다 (undefined 를 그대로 저장하지 않기 위해) */
function applyInput(
  base: Pick<CaregiverProfile, 'id' | 'availability' | 'createdAt'>,
  input: CaregiverProfileInput
): CaregiverProfile {
  return {
    ...base,
    gender: input.gender,
    yearsOfExperience: input.yearsOfExperience,
    certifications: input.certifications,
    skills: input.skills,
    careTypes: input.careTypes,
    regions: input.regions.map((region) => region.trim()).filter(Boolean),
    ...(input.minDailyWage !== undefined ? { minDailyWage: input.minDailyWage } : {}),
    ...(input.introduction?.trim() ? { introduction: input.introduction.trim() } : {}),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 저장된 프로필. 시연용 프로필 중 아직 없는 것은 여기서 채워 넣는다.
 * 시연 데이터가 늘어날 때마다 기기의 저장소를 지우지 않아도 되게 하려는 것이다.
 */
async function loadAll(): Promise<CaregiverProfile[]> {
  const stored = await loadCaregiverProfiles();
  const missing = DemoCaregiverProfiles.filter(
    (demo) => !stored.some((item) => item.id === demo.id)
  );

  if (missing.length === 0) {
    return stored;
  }

  const merged = [...stored, ...missing];
  await saveCaregiverProfiles(merged);
  return merged;
}

async function findProfile(caregiverId: string): Promise<CaregiverProfile | undefined> {
  const all = await loadAll();
  return all.find((profile) => profile.id === caregiverId);
}

async function upsert(profile: CaregiverProfile): Promise<void> {
  const all = await loadAll();
  const exists = all.some((item) => item.id === profile.id);

  await saveCaregiverProfiles(
    exists ? all.map((item) => (item.id === profile.id ? profile : item)) : [...all, profile]
  );
}

export const mockCaregiverAdapter: CaregiverAdapter = {
  async getProfile(caregiverId) {
    await delay();
    return (await findProfile(caregiverId)) ?? null;
  },

  async saveProfile(caregiverId, input) {
    await delay();
    const existing = await findProfile(caregiverId);

    const profile = applyInput(
      {
        id: caregiverId,
        // 프로필만 고칠 때 이미 저장한 시간표가 지워지면 안 된다
        availability: existing?.availability ?? [],
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      },
      input
    );

    await upsert(profile);
    return profile;
  },

  async saveAvailability(caregiverId, slots) {
    await delay();
    const existing = await findProfile(caregiverId);

    if (!existing) {
      throw new ApiError('invalid_state', '프로필을 먼저 등록한 뒤 가능 시간을 설정해 주세요.');
    }

    const updated: CaregiverProfile = {
      ...existing,
      availability: sortSlots(slots),
      updatedAt: new Date().toISOString(),
    };

    await upsert(updated);
    return updated;
  },
};

/** 매칭 어댑터가 후보를 훑을 때 쓴다. Mock 모드에는 데이터베이스가 없어 목록을 통째로 읽는다. */
export async function readAllMockCaregiverProfiles(): Promise<CaregiverProfile[]> {
  return loadAll();
}
