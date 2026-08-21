import type { CareRequestStatus, CareTimeSlot, CareType, CaregiverGenderPreference, CognitionLevel, Gender, MobilityLevel, UserRole, Weekday } from '@/types';

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
  /** 요청을 수락한 간병인(profiles.id). 아직 매칭 전이면 null */
  matched_caregiver_id: string | null;
  matched_at: string | null;
  /** AI가 원문을 구조화한 결과. 구조가 정해지기 전까지는 형태를 고정하지 않는다. */
  ai_conditions: unknown | null;
  ai_analyzed_at: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * 간병인에게 공개하는 요청 뷰(public.caregiver_care_requests)의 행.
 *
 * 보호자를 가리키는 값은 들어 있지 않고, 환자 정보는 판단에 필요한 항목만 붙어 있다.
 * 환자 이름은 이 요청을 수락한 간병인에게만 원래 값으로 내려오고 그 전에는 가려져 있다.
 */
export type CaregiverCareRequestRow = Omit<
  CareRequestRow,
  'guardian_id' | 'patient_id' | 'ai_conditions' | 'ai_analyzed_at'
> & {
  patient_name: string;
  patient_birth_year: number;
  patient_gender: Gender;
  patient_mobility: MobilityLevel;
  patient_cognition: CognitionLevel;
  patient_conditions: string[];
};

export type CaregiverProfileRow = {
  /** profiles.id 와 같다. 간병인 한 명당 프로필은 하나다. */
  id: string;
  gender: Gender;
  years_of_experience: number;
  certifications: string[];
  skills: string[];
  care_types: CareType[];
  regions: string[];
  /** 희망 일당(원). 정하지 않았으면 null(협의) */
  min_daily_wage: number | null;
  introduction: string | null;
  created_at: string;
  updated_at: string;
};

/** 가능 시간표의 한 칸이 한 행이다. 매칭에서 "이 시간에 가능한 사람"을 바로 훑기 위한 모양이다. */
export type CaregiverAvailabilityRow = {
  caregiver_id: string;
  weekday: Weekday;
  slot: CareTimeSlot;
  created_at: string;
};

/**
 * public.recommendation_candidates() 가 돌려주는 행.
 *
 * 제외 조건에 걸리지 않는 간병인만, 이름을 가린 채로 담긴다.
 * 가능 시간은 'mon:morning' 모양의 문자열 배열이다 — 함수 반환 타입을 단순하게 두려는 것이다.
 */
export type RecommendationCandidateRow = {
  caregiver_id: string;
  name: string;
  gender: Gender;
  years_of_experience: number;
  certifications: string[];
  skills: string[];
  care_types: CareType[];
  regions: string[];
  min_daily_wage: number | null;
  introduction: string | null;
  availability: string[];
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
          | 'matched_caregiver_id'
          | 'matched_at'
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
              | 'matched_caregiver_id'
              | 'matched_at'
              | 'ai_conditions'
              | 'ai_analyzed_at'
            >
          >;
        Update: Partial<CareRequestRow>;
        Relationships: [];
      };
      caregiver_profiles: {
        Row: CaregiverProfileRow;
        Insert: Omit<
          CaregiverProfileRow,
          'created_at' | 'updated_at' | 'certifications' | 'skills' | 'care_types' | 'regions'
        > &
          Partial<
            Pick<
              CaregiverProfileRow,
              'created_at' | 'updated_at' | 'certifications' | 'skills' | 'care_types' | 'regions'
            >
          >;
        Update: Partial<CaregiverProfileRow>;
        Relationships: [];
      };
      caregiver_availability: {
        Row: CaregiverAvailabilityRow;
        Insert: Omit<CaregiverAvailabilityRow, 'created_at'> &
          Partial<Pick<CaregiverAvailabilityRow, 'created_at'>>;
        Update: Partial<CaregiverAvailabilityRow>;
        Relationships: [];
      };
    };
    Views: {
      /** 간병인이 읽을 수 있는 유일한 요청 창구. 대기중 요청과 본인이 수락한 요청만 담긴다. */
      caregiver_care_requests: {
        Row: CaregiverCareRequestRow;
        Relationships: [];
      };
    };
    Functions: {
      /**
       * 대기중 요청을 수락한다.
       * 수락한 요청의 id를 돌려주고, 이미 다른 간병인이 가져갔으면 null을 돌려준다.
       */
      accept_care_request: {
        Args: { request_id: string };
        Returns: string | null;
      };
      /** 이 요청의 추천 후보가 될 수 있는 간병인. 본인이 올린 요청에만 쓸 수 있다. */
      recommendation_candidates: {
        Args: { request_id: string };
        Returns: RecommendationCandidateRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
