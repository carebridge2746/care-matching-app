import type { CareRequestStatus, CareType, CaregiverGenderPreference, CognitionLevel, Gender, MobilityLevel, UserRole } from '@/types';

/**
 * Supabase 테이블 타입 — 데이터베이스와 앱이 만나는 경계.
 *
 * 실제 스키마는 supabase/schema.sql 에 있으며 두 곳을 함께 수정해야 한다.
 * 테이블이 많아지면 `npx supabase gen types typescript` 결과로 교체한다.
 *
 * 컬럼 이름은 데이터베이스 관례대로 snake_case 를 쓴다.
 * 앱에서 쓰는 camelCase 도메인 타입(src/types)으로는 조회 결과를 읽는 쪽에서 변환한다.
 */

export type ProfileRow = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

export type PatientRow = {
  id: string;
  guardian_id: string;
  name: string;
  birth_year: number;
  gender: Gender;
  relationship: string | null;
  conditions: string[];
  mobility: MobilityLevel;
  cognition: CognitionLevel;
  care_notes: string | null;
  created_at: string;
  updated_at: string;
};

/** 데이터베이스에 저장되는 상태 값. 앱에서 쓰는 표기와 달리 snake_case 다. */
export type CareRequestStatusRow =
  | 'pending'
  | 'matched'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type CareRequestRow = {
  id: string;
  guardian_id: string;
  patient_id: string;
  request_text: string;
  care_type: CareType;
  region: string;
  start_date: string;
  end_date: string | null;
  daily_start_time: string | null;
  daily_end_time: string | null;
  required_skills: string[];
  preferred_caregiver_gender: CaregiverGenderPreference;
  budget_per_day: number | null;
  status: CareRequestStatusRow;
  /** Phase 4에서 AI가 채운다. 구조가 정해지기 전까지는 형태를 고정하지 않는다. */
  ai_conditions: unknown | null;
  ai_analyzed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** 상태 표기 변환 — 저장할 때 */
export const CareRequestStatusToRow: Record<CareRequestStatus, CareRequestStatusRow> = {
  pending: 'pending',
  matched: 'matched',
  inProgress: 'in_progress',
  completed: 'completed',
  cancelled: 'cancelled',
  noShow: 'no_show',
};

/** 상태 표기 변환 — 읽어올 때 */
export const CareRequestStatusFromRow: Record<CareRequestStatusRow, CareRequestStatus> = {
  pending: 'pending',
  matched: 'matched',
  in_progress: 'inProgress',
  completed: 'completed',
  cancelled: 'cancelled',
  no_show: 'noShow',
};

/** 서버가 채우는 값(id, 시각)과 기본값이 있는 컬럼은 넣지 않아도 된다 */
type Generated = 'id' | 'created_at' | 'updated_at';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Omit<ProfileRow, Generated> & Partial<Pick<ProfileRow, Generated>>;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      patients: {
        Row: PatientRow;
        Insert: Omit<PatientRow, Generated | 'conditions' | 'cognition'> &
          Partial<Pick<PatientRow, Generated | 'conditions' | 'cognition'>>;
        Update: Partial<PatientRow>;
        Relationships: [];
      };
      care_requests: {
        Row: CareRequestRow;
        Insert: Omit<
          CareRequestRow,
          | Generated
          | 'required_skills'
          | 'preferred_caregiver_gender'
          | 'status'
          | 'ai_conditions'
          | 'ai_analyzed_at'
        > &
          Partial<
            Pick<
              CareRequestRow,
              | Generated
              | 'required_skills'
              | 'preferred_caregiver_gender'
              | 'status'
              | 'ai_conditions'
              | 'ai_analyzed_at'
            >
          >;
        Update: Partial<CareRequestRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
