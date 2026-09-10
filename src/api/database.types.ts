import type { AdminActionTargetType, AdminActionType, CareRequestStatus, CareTimeSlot, CareType, CaregiverGenderPreference, CognitionLevel, DisputedMatchKind, Gender, MatchStatus, MobilityLevel, ReviewReportReason, UserRole, Weekday } from '@/types';

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
export type MatchStatusRow =
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

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
  /** 노쇼로 신고된 시각. 신고는 보호자만 할 수 있다. */
  no_show_at: string | null;
  no_show_reported_by: string | null;
  no_show_note: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * public.match_details 뷰의 행.
 *
 * 매칭에 간병 조건·환자·양쪽 사람을 붙여서 내보낸다.
 * 환자 특이사항과 연락처는 매칭이 성사되어 있는 동안에만 채워지고,
 * 취소되거나 간병인이 오지 않은 매칭에서는 상대방 이름까지 가려진 채로 내려온다.
 *
 * 노쇼를 신고한 사람(no_show_reported_by)은 뷰에 담기지 않는다. 노쇼는 언제나 보호자가
 * 신고하므로 식별자를 한 번 더 내보내도 새로 알 수 있는 것이 없다 —
 * 취소한 쪽(cancelled_by)은 양쪽 모두 될 수 있어서 함께 내보낸다.
 */
export type MatchDetailRow = Omit<MatchRow, 'no_show_reported_by'> & {
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
  /**
   * 관리자가 지운 시각. 행은 남고 읽는 쪽에서 걸러낸다.
   *
   * 평균(user_ratings)과 남에게 보여 주는 목록(public_reviews)에서는 빠지지만,
   * reviews 테이블을 직접 읽는 당사자 조회에는 그대로 내려온다 —
   * 작성자 본인에게는 자기 후기가 왜 사라졌는지가 보여야 한다.
   */
  deleted_at: string | null;
  deleted_by: string | null;
  deleted_reason: string | null;
};

/** 신고 사유의 데이터베이스 표기. 상태 값들과 마찬가지로 snake_case 다. */
export type ReviewReportReasonRow = 'abuse' | 'false_info' | 'privacy' | 'spam' | 'other';

/** 신고의 처리 상태. 앱 표기와 같아서 변환이 필요 없다. */
export type ReviewReportStatusRow = 'open' | 'accepted' | 'dismissed';

/**
 * 부적절한 후기 신고 한 줄.
 *
 * 앱은 이 표에 직접 쓰지 못한다. 신고는 report_review() 가, 처리는 관리자 함수가 한다.
 * 읽기는 본인이 낸 신고만 열려 있다.
 */
export type ReviewReportRow = {
  id: string;
  review_id: string;
  reporter_id: string;
  reason: ReviewReportReasonRow;
  detail: string | null;
  status: ReviewReportStatusRow;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
};

/**
 * public.admin_review_reports() 가 돌려주는 행.
 *
 * 신고·후기·사람 셋을 이어 붙인 한 줄이다. 이름을 가리지 않는 유일한 창구이며,
 * 관리자만 부를 수 있다 (함수 안에서 is_admin() 을 확인한다).
 */
export type AdminReviewReportRow = {
  report_id: string;
  review_id: string;
  match_id: string;
  reason: ReviewReportReasonRow;
  detail: string | null;
  status: ReviewReportStatusRow;
  created_at: string;
  resolved_at: string | null;
  resolution_note: string | null;
  report_count: number;
  reporter_id: string;
  reporter_name: string;
  rating: number;
  comment: string | null;
  review_created_at: string;
  review_deleted_at: string | null;
  reviewer_id: string;
  reviewer_name: string;
  reviewee_id: string;
  reviewee_name: string;
};

/** 관리자가 손대야 하는 매칭의 종류. no_show 는 신고된 건, overdue 는 방치된 건이다. */
export type DisputedMatchKindRow = 'no_show' | 'overdue';

/** public.admin_disputed_matches() 가 돌려주는 행. 환자 정보와 연락처는 담기지 않는다. */
export type DisputedMatchRow = {
  kind: DisputedMatchKindRow;
  match_id: string;
  request_id: string;
  status: MatchStatusRow;
  region: string;
  start_date: string;
  end_date: string | null;
  accepted_at: string;
  started_at: string | null;
  no_show_at: string | null;
  no_show_note: string | null;
  guardian_id: string;
  guardian_name: string;
  caregiver_id: string;
  caregiver_name: string;
};

export type AdminActionTypeRow =
  | 'review_deleted'
  | 'review_restored'
  | 'report_dismissed'
  | 'no_show_cleared'
  | 'match_cancelled';

export type AdminActionTargetTypeRow = 'review' | 'review_report' | 'match';

/**
 * 관리자가 한 조치의 기록.
 *
 * admin_id 는 null 이 될 수 있다. 관리자 계정이 지워져도 기록은 남아야 해서
 * on delete set null 로 두었기 때문이다.
 */
export type AdminActionRow = {
  id: string;
  admin_id: string | null;
  action: AdminActionTypeRow;
  target_type: AdminActionTargetTypeRow;
  target_id: string;
  note: string | null;
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

/**
 * public.published_courses 뷰의 행.
 *
 * 과정 표에는 문항 수가 없다. 세어서 붙이는 값이라 저장하지 않고 뷰가 그때그때 센다 —
 * 평균 별점을 user_ratings 뷰가 세는 것과 같은 이유다.
 */
export type PublishedCourseRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  certification_label: string | null;
  estimated_minutes: number;
  pass_score: number;
  display_order: number;
  question_count: number;
};

export type TrainingLessonRow = {
  id: string;
  course_id: string;
  display_order: number;
  title: string;
  body: string;
  key_points: string[];
  created_at: string;
};

/**
 * public.course_quiz() 가 돌려주는 행.
 *
 * 정답(answer_index)과 해설은 담기지 않는다. 문항 표(training_quiz_questions)에는
 * select 정책이 아예 없어서 이 함수 말고는 읽을 창구가 없다.
 */
export type QuizQuestionRow = {
  id: string;
  display_order: number;
  question: string;
  choices: string[];
};

export type QuizAttemptRow = {
  id: string;
  course_id: string;
  caregiver_id: string;
  correct_count: number;
  question_count: number;
  score: number;
  passed: boolean;
  created_at: string;
};

export type TrainingCompletionRow = {
  id: string;
  course_id: string;
  caregiver_id: string;
  attempt_id: string;
  completed_at: string;
};

/** public.submit_quiz() 에 보내는 답 한 줄. choice_index 는 1부터다. */
export type QuizAnswerInput = {
  question_id: string;
  choice_index: number;
};

/**
 * public.submit_quiz() 가 돌려주는 JSON.
 *
 * 채점 결과와 응시 기록을 한 번에 받는다. 나눠서 부르면 채점과 조회 사이에
 * 다른 응시가 끼어들 수 있고, 화면은 방금 낸 그 답의 결과를 보여 줘야 한다.
 */
export type QuizGradeRow = {
  attempt: QuizAttemptRow;
  results: {
    question_id: string;
    /** 고르지 않고 낸 문항은 null */
    selected_index: number | null;
    answer_index: number;
    is_correct: boolean;
    explanation: string;
  }[];
  is_new_completion: boolean;
  /** 수료하지 않았으면 null */
  completed_at: string | null;
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
  noShow: 'no_show',
};

export const MatchStatusFromRow: Record<MatchStatusRow, MatchStatus> = {
  accepted: 'accepted',
  in_progress: 'inProgress',
  completed: 'completed',
  cancelled: 'cancelled',
  no_show: 'noShow',
};

/** 신고 사유 표기 변환 */
export const ReviewReportReasonToRow: Record<ReviewReportReason, ReviewReportReasonRow> = {
  abuse: 'abuse',
  falseInfo: 'false_info',
  privacy: 'privacy',
  spam: 'spam',
  other: 'other',
};

export const ReviewReportReasonFromRow: Record<ReviewReportReasonRow, ReviewReportReason> = {
  abuse: 'abuse',
  false_info: 'falseInfo',
  privacy: 'privacy',
  spam: 'spam',
  other: 'other',
};

/** 관리자가 손대야 하는 매칭의 종류 표기 변환 */
export const DisputedMatchKindFromRow: Record<DisputedMatchKindRow, DisputedMatchKind> = {
  no_show: 'noShow',
  overdue: 'overdue',
};

/** 관리자 조치 표기 변환 */
export const AdminActionTypeFromRow: Record<AdminActionTypeRow, AdminActionType> = {
  review_deleted: 'reviewDeleted',
  review_restored: 'reviewRestored',
  report_dismissed: 'reportDismissed',
  no_show_cleared: 'noShowCleared',
  match_cancelled: 'matchCancelled',
};

export const AdminActionTargetTypeFromRow: Record<
  AdminActionTargetTypeRow,
  AdminActionTargetType
> = {
  review: 'review',
  review_report: 'reviewReport',
  match: 'match',
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
      /**
       * 후기 신고. 본인이 낸 신고만 읽을 수 있다.
       *
       * 쓰는 창구는 report_review() 하나뿐이고, 처리는 관리자 함수만 한다.
       * 관리자가 큐를 읽는 것도 이 표가 아니라 admin_review_reports() 를 지난다 —
       * 판단에 필요한 것이 신고 한 줄이 아니라 신고·후기·사람을 이은 한 줄이기 때문이다.
       */
      review_reports: {
        Row: ReviewReportRow;
        Insert: Omit<ReviewReportRow, 'id' | 'created_at' | 'status'> &
          Partial<Pick<ReviewReportRow, 'id' | 'created_at' | 'status'>>;
        Update: Partial<ReviewReportRow>;
        Relationships: [];
      };
      /**
       * 관리자가 한 조치의 기록. 관리자만 읽을 수 있고, 쓰는 창구는 앱에 없다
       * (조치 함수들이 데이터베이스 안에서 직접 남긴다).
       */
      admin_actions: {
        Row: AdminActionRow;
        Insert: Omit<AdminActionRow, 'id' | 'created_at'> &
          Partial<Pick<AdminActionRow, 'id' | 'created_at'>>;
        Update: Partial<AdminActionRow>;
        Relationships: [];
      };
      /**
       * 교육 내용. 공개된 과정의 것만 읽을 수 있고 쓰는 창구는 없다.
       *
       * 문항 표(training_quiz_questions)는 일부러 여기에 없다. 정답이 들어 있는 표라
       * 앱이 직접 읽을 수 없어야 하고, 타입에 두지 않으면 실수로 부르는 코드가
       * 컴파일 단계에서 막힌다. 문항은 course_quiz() 로만 받는다.
       */
      training_lessons: {
        Row: TrainingLessonRow;
        Insert: Omit<TrainingLessonRow, 'id' | 'created_at'> &
          Partial<Pick<TrainingLessonRow, 'id' | 'created_at'>>;
        Update: Partial<TrainingLessonRow>;
        Relationships: [];
      };
      /**
       * 응시와 수료도 읽기만 한다.
       * 만드는 일은 submit_quiz() 만 할 수 있다 (두 표 모두 insert 정책이 없다).
       */
      training_quiz_attempts: {
        Row: QuizAttemptRow;
        Insert: Omit<QuizAttemptRow, 'id' | 'created_at'> &
          Partial<Pick<QuizAttemptRow, 'id' | 'created_at'>>;
        Update: Partial<QuizAttemptRow>;
        Relationships: [];
      };
      training_completions: {
        Row: TrainingCompletionRow;
        Insert: Omit<TrainingCompletionRow, 'id' | 'completed_at'> &
          Partial<Pick<TrainingCompletionRow, 'id' | 'completed_at'>>;
        Update: Partial<TrainingCompletionRow>;
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
      /** 공개된 교육 과정과 그 문항 수. 정답은 담기지 않아 누구에게나 열어도 된다. */
      published_courses: {
        Row: PublishedCourseRow;
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
       * 간병인이 오지 않았다고 신고한다. 보호자만 부를 수 있다.
       * 요청은 곧바로 다시 대기중이 되고, 그 간병인은 이 요청을 다시 수락할 수 없다.
       */
      report_no_show: {
        Args: { match_id: string; note?: string | null };
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
      /**
       * 후기를 신고한다. 그 후기의 당사자 두 사람만 부를 수 있다.
       * 이미 신고했으면 null 을 돌려준다 — 같은 후기를 두 번 신고해도 줄이 늘지 않는다.
       */
      report_review: {
        Args: { target_review: string; reason: ReviewReportReasonRow; detail?: string | null };
        Returns: string | null;
      };
      /**
       * 아래 admin_ 함수들은 모두 관리자만 부를 수 있다.
       * 관리자가 아니면 null 이 아니라 예외(42501)로 거절한다 — 권한이 없는 호출은
       * "지금 할 수 없는 동작"이 아니라 일어나면 안 되는 일이고, 조용히 빈 값을
       * 돌려주면 앱이 그것을 "신고가 없다"로 읽는다.
       */
      admin_review_reports: {
        Args: { target_status?: ReviewReportStatusRow };
        Returns: AdminReviewReportRow[];
      };
      /**
       * 후기를 지운 표시를 하고 그 후기의 열린 신고를 함께 마감한다.
       * 없는 후기이거나 이미 지워졌으면 null 을 돌려준다.
       */
      admin_delete_review: {
        Args: { target_review: string; note?: string | null };
        Returns: string | null;
      };
      /** 잘못 지운 후기를 되돌린다. 그때 마감했던 신고는 반려로 바뀐다. */
      admin_restore_review: {
        Args: { target_review: string; note?: string | null };
        Returns: string | null;
      };
      /** 신고를 반려한다. 후기는 그대로 남는다. */
      admin_dismiss_report: {
        Args: { target_report: string; note?: string | null };
        Returns: string | null;
      };
      /** 노쇼로 신고된 매칭과, 끝날 날이 지났는데 아직 살아 있는 매칭. */
      admin_disputed_matches: {
        Args: Record<string, never>;
        Returns: DisputedMatchRow[];
      };
      /**
       * 잘못된 노쇼 신고를 되돌린다.
       * 매칭은 accepted 로 돌아가지 않고 취소로 남는다 — 그 사이 다른 간병인이
       * 같은 요청을 수락했을 수 있어서, 되돌리면 살아 있는 매칭이 둘이 된다.
       */
      admin_clear_no_show: {
        Args: { target_match: string; note?: string | null };
        Returns: string | null;
      };
      /** 살아 있는 매칭을 관리자가 끊는다. 요청 처리는 cancel_match() 와 같은 규칙이다. */
      admin_cancel_match: {
        Args: { target_match: string; reason?: string | null };
        Returns: string | null;
      };
      /**
       * 이 과정의 퀴즈 문항. 정답과 해설은 내려오지 않는다.
       *
       * 인자 이름이 course_id 가 아닌 것은, 함수 안에서 문항 표의 course_id 컬럼과
       * 이름이 겹치면 어느 쪽인지 가려야 하기 때문이다. submit_quiz 도 같은 이유다.
       */
      course_quiz: {
        Args: { target_course: string };
        Returns: QuizQuestionRow[];
      };
      /**
       * 퀴즈를 내고 채점받는다.
       * 점수와 합격 여부는 앱이 정하지 않는다 — 함수가 정답과 맞춰 보고 직접 매긴다.
       */
      submit_quiz: {
        Args: { target_course: string; submitted_answers: QuizAnswerInput[] };
        Returns: QuizGradeRow;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
