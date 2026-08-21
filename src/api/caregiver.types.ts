import type { AvailabilitySlot, CareType, CaregiverProfile, Gender } from '@/types';

/**
 * 간병인 프로필 어댑터의 계약.
 *
 * 화면과 저장소는 이 타입에만 의존한다.
 * 구현은 로컬 Mock(caregiver.mock.ts)과 Supabase(caregiver.supabase.ts) 두 가지다.
 *
 * 프로필과 가능 시간은 한 사람의 정보지만 저장을 나눠 둔다.
 * 화면이 둘로 나뉘어 있고, 시간표만 바꾸려다 프로필 전체를 덮어쓰는 일이 없어야 하기 때문이다.
 */

/** 프로필 화면이 채우는 값. 가능 시간은 여기에 들어 있지 않다. */
export type CaregiverProfileInput = {
  gender: Gender;
  yearsOfExperience: number;
  certifications: string[];
  skills: string[];
  careTypes: CareType[];
  regions: string[];
  introduction?: string;
};

export type CaregiverAdapter = {
  /** 아직 등록하지 않았으면 null. 오류가 아니라 "없음"이다. */
  getProfile: (caregiverId: string) => Promise<CaregiverProfile | null>;
  /** 없으면 만들고 있으면 고친다. 이미 저장된 가능 시간은 그대로 둔다. */
  saveProfile: (caregiverId: string, input: CaregiverProfileInput) => Promise<CaregiverProfile>;
  /**
   * 가능 시간표를 통째로 바꾼다.
   *
   * 칸 하나씩 더하고 빼지 않는 이유는 화면이 표 전체를 편집하기 때문이다.
   * 프로필을 먼저 등록해야 한다 — 시간표만 있고 역량이 없는 간병인은 매칭 대상이 될 수 없다.
   */
  saveAvailability: (
    caregiverId: string,
    slots: AvailabilitySlot[]
  ) => Promise<CaregiverProfile>;
};
