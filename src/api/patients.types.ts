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

export type PatientsAdapter = {
  /** 보호자가 등록한 환자 목록. 최근에 등록한 순서로 돌려준다. */
  list: (guardianId: string) => Promise<Patient[]>;
  create: (guardianId: string, input: PatientInput) => Promise<Patient>;
  update: (id: string, input: PatientInput) => Promise<Patient>;
  remove: (id: string) => Promise<void>;
};
