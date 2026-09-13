import type { CognitionLevel, Gender, MobilityLevel, Patient } from '@/types';

/**
 * 환자 정보 어댑터의 계약.
 *
 * 화면과 저장소는 이 타입에만 의존한다.
 * 구현은 로컬 Mock(patients.mock.ts)과 Supabase(patients.supabase.ts) 두 가지다.
 */

/** 등록·수정 화면이 채우는 값. id와 시각은 서버가 정한다. */
export type PatientInput = {
  name: string;
  birthYear: number;
  gender: Gender;
  relationship?: string;
  conditions: string[];
  mobility: MobilityLevel;
  cognition: CognitionLevel;
  careNotes?: string;
};

/**
 * 환자를 지운 결과.
 *   deleted    — 간병 기록이 없어 행째 지웠다 (요청도 함께)
 *   anonymized — 기록이 남아 있어 행은 두고 이름·관계·질환·특이사항만 지웠다
 */
export type PatientRemoval = 'deleted' | 'anonymized';

export type PatientsAdapter = {
  /** 보호자가 등록한 환자 목록. 최근에 등록한 순서로 돌려준다. 지운 환자는 나오지 않는다. */
  list: (guardianId: string) => Promise<Patient[]>;
  create: (guardianId: string, input: PatientInput) => Promise<Patient>;
  update: (id: string, input: PatientInput) => Promise<Patient>;
  /**
   * 환자를 지운다.
   *
   * 간병 기록(매칭이 한 번이라도 붙은 요청)이 있으면 행째 지우지 않고 익명화한다 — 행을 지우면
   * 기록이 함께 사라져, 간병인이 받은 후기와 노쇼 기록까지 없어진다. 기록이 없는 요청은 지우고,
   * 기록이 있는데 아직 대기중인 요청은 취소로 닫는다.
   *
   * 진행 중인 간병(수락·진행중)이 있으면 `invalid_state` 로 거절한다. 간병인이 보고 있는
   * 환자 정보가 갑자기 사라지면 안 된다.
   */
  remove: (id: string) => Promise<PatientRemoval>;
};
