import type { CareRequestStatus, CareTimeSlot, CareType, CaregiverGenderPreference, CognitionLevel, Gender, MatchStatus, MobilityLevel, UserRole, Weekday } from '@/types';

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
  /** 평균 별점. 후기가 없으면 null. numeric 이므로 문자열로 내려올 수 있다. */
  rating_avg: string | number | null;
  review_count: number;
};

/** 매칭 상태의 데이터베이스 표기. 요청 상태와 마찬가지로 snake_case 다. */
export type MatchStatusRow = 'accepted' | 'in_progress' | 'completed' | 'cancelled';

/**
 * 수락 이후의 간병 한 건.
 *
 * 상태가 바뀐 시각을 한 칸에 덮어쓰지 않고 각각 남긴다.
 * 취소된 행도 지우지 않고 이력으로 둔다 — 같은 요청에 매칭이 여러 번 붙을 수 있다.
 */
export type MatchRow = {
  id: string;
  request_id: string;
  guardian_id: string;
  caregiver_id: string;
  status: MatchStatusRow;
  accepted_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  /** 취소한 사람(profiles.id). 보호자와 간병인 어느 쪽이든 될 수 있다. */
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * public.match_details 뷰의 행.
 *
 * 매칭에 간병 조건·환자·양쪽 사람을 붙여서 내보낸다.
 * 환자 특이사항과 연락처는 매칭이 성사되어 있는 동안에만 채워지고,
 * 취소된 매칭에서는 상대방 이름까지 가려진 채로 내려온다.
 */
export type MatchDetailRow = MatchRow & {
  request_text: string;
  care_type: CareType;
  region: string;
  start_date: string;
  end_date: string | null;
  daily_start_time: string | null;
  daily_end_time: string | null;
  required_skills: string[];
  budget_per_day: number | null;

  patient_name: string;
  patient_birth_year: number;
  patient_gender: Gender;
  patient_mobility: MobilityLevel;
  patient_cognition: CognitionLevel;
  patient_conditions: string[];
  patient_care_notes: string | null;

  caregiver_name: string;
  caregiver_phone: string | null;
  guardian_name: string;
  guardian_phone: string | null;
};

/** 끝난 간병 한 건에 대한 평가. 매칭당 사람마다 한 줄이다. */
export type ReviewRow = {
  id: string;
  match_id: string;
  reviewer_id: string;
  reviewee_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

/**
 * public.user_ratings 뷰의 행.
 * 평균은 컬럼으로 저장하지 않고 이 뷰가 그때그때 센다.
 */
export type UserRatingRow = {
  user_id: string;
  /** numeric 은 자릿수를 잃지 않도록 문자열로 내려온다 */
  rating_avg: string | number | null;
  review_count: number;
};

/**
 * public.public_reviews() 가 돌려주는 행.
 * 작성자 이름은 가려져 있고, 어느 간병 건이었는지는 담기지 않는다.
 */
export type PublicReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name: string;
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

/** 매칭 상태 표기 변환 */
export const MatchStatusToRow: Record<MatchStatus, MatchStatusRow> = {
  accepted: 'accepted',
  inProgress: 'in_progress',
  completed: 'completed',
  cancelled: 'cancelled',
};

export const MatchStatusFromRow: Record<MatchStatusRow, MatchStatus> = {
  accepted: 'accepted',
  in_progress: 'inProgress',
  completed: 'completed',
  cancelled: 'cancelled',
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
      /**
       * 앱은 이 테이블을 읽기만 한다.
       * 만들고 바꾸는 일은 accept_care_request / start_care / complete_care / cancel_match 만 한다
       * (테이블에 insert·update 정책이 없다). Insert·Update 타입은 형식을 맞추기 위한 것이다.
       */
      matches: {
        Row: MatchRow;
        Insert: Omit<MatchRow, Generated | 'accepted_at' | 'status'> &
          Partial<Pick<MatchRow, Generated | 'accepted_at' | 'status'>>;
        Update: Partial<MatchRow>;
        Relationships: [];
      };
      /**
       * 후기도 읽기만 한다. 쓰는 일은 create_review() 만 할 수 있고,
       * 한번 쓴 후기는 고치거나 지울 수 없다 (update·delete 정책 없음).
       */
      reviews: {
        Row: ReviewRow;
        Insert: Omit<ReviewRow, 'id' | 'created_at'> &
          Partial<Pick<ReviewRow, 'id' | 'created_at'>>;
        Update: Partial<ReviewRow>;
        Relationships: [];
      };
    };
    Views: {
      /** 간병인이 읽을 수 있는 유일한 요청 창구. 대기중 요청과 본인이 수락한 요청만 담긴다. */
      caregiver_care_requests: {
        Row: CaregiverCareRequestRow;
        Relationships: [];
      };
      /** 매칭 당사자가 서로와 간병 내용을 읽는 창구. 본인이 낀 매칭만 담긴다. */
      match_details: {
        Row: MatchDetailRow;
        Relationships: [];
      };
      /** 사람별 평균 별점과 후기 수. 코멘트가 없어 누구에게나 열어도 된다. */
      user_ratings: {
        Row: UserRatingRow;
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
      /**
       * 매칭 상태를 옮기는 세 함수.
       *
       * 모두 바뀐 매칭의 id를 돌려주고, 지금 상태에서 할 수 없는 동작이면 null을 돌려준다.
       * 목록을 띄워 둔 사이에 상대가 먼저 상태를 바꾸는 일은 오류가 아니라 흔한 일이므로,
       * 예외 대신 null로 알려서 앱이 목록을 다시 불러오게 한다.
       */
      start_care: {
        Args: { match_id: string };
        Returns: string | null;
      };
      complete_care: {
        Args: { match_id: string };
        Returns: string | null;
      };
      cancel_match: {
        Args: { match_id: string; reason?: string | null };
        Returns: string | null;
      };
      /**
       * 끝난 간병에 후기를 남긴다.
       * 피평가자는 앱이 정하지 않는다 — 매칭의 상대편을 함수가 직접 고른다.
       * 이미 남긴 후기가 있으면 null 을 돌려준다.
       */
      create_review: {
        Args: { match_id: string; rating: number; comment?: string | null };
        Returns: string | null;
      };
      /** 이 사람이 받은 후기. 작성자 이름은 가려서 내려온다. */
      public_reviews: {
        Args: { subject_id: string };
        Returns: PublicReviewRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
