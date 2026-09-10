/**
 * 앱 전역 도메인 타입.
 * 각 Phase에서 필요한 타입만 점진적으로 추가한다.
 *
 * 데이터베이스 컬럼 이름(snake_case)이 아니라 앱에서 읽기 좋은 이름(camelCase)을 쓴다.
 * 두 표기 사이의 변환은 데이터베이스 경계인 src/api 에서만 한다.
 */

/** 사용자 유형 — 보호자 / 간병인 / 관리자 */
export type UserRole = 'guardian' | 'caregiver' | 'admin';

export const RoleLabels: Record<UserRole, string> = {
  guardian: '보호자',
  caregiver: '간병인',
  admin: '관리자',
};

/** 로그인한 사용자 정보 (Supabase Auth 사용자 + profiles 테이블 병합 결과) */
export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
};

// --- 환자 -------------------------------------------------------------------

export type Gender = 'male' | 'female' | 'other';

export const GenderLabels: Record<Gender, string> = {
  male: '남성',
  female: '여성',
  other: '기타',
};

/** 거동 상태 — 간병 난이도와 필요한 역량을 가르는 핵심 조건 */
export type MobilityLevel = 'independent' | 'assisted' | 'wheelchair' | 'bedridden';

export const MobilityLabels: Record<MobilityLevel, string> = {
  independent: '스스로 거동 가능',
  assisted: '부축하면 거동 가능',
  wheelchair: '휠체어 이용',
  bedridden: '거의 누워 지냄',
};

/** 인지 상태 — 치매 등으로 의사소통에 도움이 필요한 정도 */
export type CognitionLevel = 'normal' | 'mild' | 'severe';

export const CognitionLabels: Record<CognitionLevel, string> = {
  normal: '의사소통에 문제 없음',
  mild: '가끔 도움 필요',
  severe: '항상 도움 필요',
};

/** 보호자가 등록한 간병 대상자 */
export type Patient = {
  id: string;
  /** 등록한 보호자(profiles.id) */
  guardianId: string;
  name: string;
  /** 나이 대신 출생연도를 저장한다. 나이는 해가 바뀌면 틀린 값이 된다. */
  birthYear: number;
  gender: Gender;
  /** 보호자와의 관계 (어머니, 아버지, 배우자 …) */
  relationship?: string;
  /** 질환·증상 목록 */
  conditions: string[];
  mobility: MobilityLevel;
  cognition: CognitionLevel;
  /** 식사, 복약, 성격 등 간병인이 미리 알아야 할 내용 */
  careNotes?: string;
  createdAt: string;
  updatedAt: string;
};

/** 출생연도로 나이를 계산한다. 저장하지 않고 화면에서 그때그때 구한다. */
export function ageFromBirthYear(birthYear: number, today: Date = new Date()): number {
  return today.getFullYear() - birthYear;
}

// --- 간병 요청 ---------------------------------------------------------------

/** 간병이 이뤄지는 곳 */
export type CareType = 'hospital' | 'home' | 'facility';

export const CareTypeLabels: Record<CareType, string> = {
  hospital: '병원 간병',
  home: '재가(자택) 간병',
  facility: '시설 간병',
};

/** 간병인 성별 선호 */
export type CaregiverGenderPreference = 'male' | 'female' | 'any';

export const CaregiverGenderPreferenceLabels: Record<CaregiverGenderPreference, string> = {
  male: '남성 간병인',
  female: '여성 간병인',
  any: '상관 없음',
};

/**
 * 요청 상태.
 * 값의 이름을 `StatusBadge`(src/components/common/status-badge.tsx)의 색상·라벨 키와
 * 일부러 똑같이 맞춰 두었다. 상태를 화면에 보여줄 때 별도 변환이 필요 없다.
 */
export type CareRequestStatus =
  | 'pending'
  | 'matched'
  | 'inProgress'
  | 'completed'
  | 'cancelled'
  | 'noShow';

/** 보호자가 올린 간병 요청 */
export type CareRequest = {
  id: string;
  guardianId: string;
  patientId: string;
  /** 보호자가 평소 말하듯 적은 원문. AI 구조화(Phase 4)의 입력이다. */
  requestText: string;
  careType: CareType;
  /** 매칭 대상 지역 (시군구 단위) */
  region: string;
  /** YYYY-MM-DD */
  startDate: string;
  /** 종료일 미정이면 없음 */
  endDate?: string;
  /** HH:MM. 야간 간병이 있으므로 끝 시각이 시작보다 이를 수 있다. */
  dailyStartTime?: string;
  dailyEndTime?: string;
  /** 요청에 필요한 간병 역량 (흡인, 체위 변경, 식사 보조 …) */
  requiredSkills: string[];
  preferredCaregiverGender: CaregiverGenderPreference;
  /** 일당 예산(원). 미정이면 없음 */
  budgetPerDay?: number;
  status: CareRequestStatus;
  /** 요청을 수락한 간병인(profiles.id). 아직 매칭 전이면 없음 */
  matchedCaregiverId?: string;
  /** 간병인이 수락한 시각 */
  matchedAt?: string;
  /**
   * AI 가 원문을 정리한 조건. 아래 AiCareConditions 를 참고한다.
   * 정리에 실패했거나 AI 를 끄고 올린 요청에는 없다 — 없다고 해서 요청이 덜 유효한 것은 아니다.
   */
  aiConditions?: AiCareConditions;
  aiAnalyzedAt?: string;
  createdAt: string;
  updatedAt: string;
};

// --- 간병인이 보는 요청 -------------------------------------------------------

/**
 * 간병인에게 보여 주는 환자 요약.
 *
 * 요청을 수락할지 판단하는 데 필요한 항목만 담는다.
 * 이름은 매칭이 확정되기 전까지 성만 남기고 가리며(김OO), 연락처와 특이사항은 아예 넣지 않는다.
 */
export type PatientSummary = {
  name: string;
  birthYear: number;
  gender: Gender;
  mobility: MobilityLevel;
  cognition: CognitionLevel;
  conditions: string[];
};

/**
 * 간병인 화면에 보이는 간병 요청.
 *
 * 보호자를 가리키는 값(guardianId)과 환자 식별자(patientId)는 들어 있지 않다.
 * 간병인은 "누가 올렸는지"가 아니라 "어떤 간병인지"만 보고 수락 여부를 정한다.
 */
export type CaregiverCareRequest = Omit<CareRequest, 'guardianId' | 'patientId'> & {
  patient: PatientSummary;
};

// --- 간병인 프로필 -----------------------------------------------------------

/** 요일. 주간 가능 시간표의 세로축이다. */
export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

/** 화면과 저장 양쪽이 같은 순서를 쓰도록 한 곳에 둔다 (월요일 시작) */
export const Weekdays: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export const WeekdayLabels: Record<Weekday, string> = {
  mon: '월요일',
  tue: '화요일',
  wed: '수요일',
  thu: '목요일',
  fri: '금요일',
  sat: '토요일',
  sun: '일요일',
};

/**
 * 하루를 나누는 간병 시간대.
 *
 * 분 단위로 받지 않는다. 간병 근무가 실제로 이 세 덩어리로 짜이고,
 * 요청의 시간대(dailyStartTime~dailyEndTime)와 겹치는지 보는 데도 이만큼이면 충분하다.
 */
export type CareTimeSlot = 'morning' | 'afternoon' | 'night';

export const CareTimeSlots: CareTimeSlot[] = ['morning', 'afternoon', 'night'];

export const CareTimeSlotLabels: Record<CareTimeSlot, string> = {
  morning: '오전',
  afternoon: '오후',
  night: '야간',
};

/** 시간대가 가리키는 실제 시각. 화면 안내와 매칭 계산이 같은 값을 보도록 여기에 둔다. */
export const CareTimeSlotHours: Record<CareTimeSlot, string> = {
  morning: '06:00 ~ 12:00',
  afternoon: '12:00 ~ 18:00',
  night: '18:00 ~ 06:00',
};

/** 가능 시간표의 한 칸 */
export type AvailabilitySlot = {
  weekday: Weekday;
  slot: CareTimeSlot;
};

/**
 * 간병인이 등록한 프로필.
 *
 * 간병인 한 명당 하나이며 id는 `profiles.id` 와 같다.
 * 보호자가 등록하는 환자와 달리 여러 개를 가질 수 없어서 별도 식별자를 두지 않았다.
 */
export type CaregiverProfile = {
  id: string;
  /** 요청의 '간병인 성별' 선호(preferredCaregiverGender)와 맞춰 보는 값 */
  gender: Gender;
  /** 간병 경력(년). 0이면 신입이다. */
  yearsOfExperience: number;
  /** 보유 자격 (요양보호사, 간호조무사 …) */
  certifications: string[];
  /** 할 수 있는 간병 역량. 요청의 requiredSkills 와 같은 목록에서 고른다. */
  skills: string[];
  /** 맡을 수 있는 간병 장소 */
  careTypes: CareType[];
  /** 근무 가능 지역 (시군구 단위). 요청의 region 과 맞춰 본다. */
  regions: string[];
  /** 희망 일당(원). 요청의 budgetPerDay 와 맞춰 본다. 정하지 않았으면 없음(협의) */
  minDailyWage?: number;
  /** 보호자에게 보여 줄 자기소개 */
  introduction?: string;
  /** 근무 가능한 요일·시간대. 비어 있으면 아직 설정하지 않은 것이다. */
  availability: AvailabilitySlot[];
  createdAt: string;
  updatedAt: string;
};

// --- 매칭 --------------------------------------------------------------------

/**
 * 추천 목록에 보이는 간병인.
 *
 * 프로필 전체가 아니라 보호자가 고를 때 필요한 항목만 담는다.
 * 이름은 매칭이 확정되기 전까지 성만 남기고 가린다 — 환자 이름을 가리는 것과 같은 규칙이다.
 */
export type CaregiverCandidate = {
  id: string;
  name: string;
  gender: Gender;
  yearsOfExperience: number;
  certifications: string[];
  skills: string[];
  careTypes: CareType[];
  regions: string[];
  minDailyWage?: number;
  introduction?: string;
  availability: AvailabilitySlot[];
  /**
   * 지금까지 받은 평가. 화면에 보여 주기만 하고 매칭 점수에는 넣지 않는다 —
   * 별점을 배점에 섞으면 후기가 없는 새 간병인이 계속 아래로 밀려 첫 매칭을 잡지 못한다.
   */
  rating: UserRating;
};

/** 점수 한 줄. 총점만 보여 주면 왜 그 사람이 위에 있는지 알 수 없다. */
export type MatchScoreItem = {
  /** '지역', '역량' 처럼 화면에 그대로 쓰는 이름 */
  label: string;
  score: number;
  max: number;
  /** 왜 이 점수인지 한 줄로 */
  detail: string;
};

/**
 * 요청 하나와 간병인 한 명을 맞춰 본 결과.
 *
 * 제외 조건에 걸리면 점수를 매기지 않는다. 맡을 수 없는 장소이거나
 * 보호자가 지정한 성별이 아니면, 점수가 높아도 추천해서는 안 되기 때문이다.
 */
export type MatchResult = {
  /** 0~100. 제외되면 0 */
  total: number;
  isEligible: boolean;
  /** 제외된 이유. isEligible 이 true 면 없음 */
  excludedReason?: string;
  items: MatchScoreItem[];
};

export type CaregiverRecommendation = {
  caregiver: CaregiverCandidate;
  score: MatchResult;
};

// --- 매칭과 간병 진행 ---------------------------------------------------------

/**
 * 매칭 상태.
 *
 * 요청 상태(CareRequestStatus)와 값이 겹쳐 보이지만 가리키는 것이 다르다.
 * 요청은 "이 간병 자리가 지금 어떤 상태인가"이고, 매칭은 "이 사람과의 간병 한 건이
 * 어떻게 흘러갔는가"다. 취소된 매칭이 남아 있어도 요청은 다시 대기중일 수 있다.
 */
export type MatchStatus = 'accepted' | 'inProgress' | 'completed' | 'cancelled' | 'noShow';

export const MatchStatusLabels: Record<MatchStatus, string> = {
  accepted: '매칭 완료',
  inProgress: '간병 진행중',
  completed: '간병 종료',
  cancelled: '취소됨',
  noShow: '오지 않음',
};

/**
 * 화면 배지(StatusBadge)의 색상 키.
 * 수락 상태만 이름이 다르고(accepted → matched) 나머지는 요청 상태와 같은 키를 쓴다.
 */
export const MatchStatusTones: Record<MatchStatus, CareRequestStatus> = {
  accepted: 'matched',
  inProgress: 'inProgress',
  completed: 'completed',
  cancelled: 'cancelled',
  noShow: 'noShow',
};

/** 아직 끝나지 않은 매칭. 시작·종료·취소 버튼은 이때만 보여 준다. */
export function isMatchLive(status: MatchStatus): boolean {
  return status === 'accepted' || status === 'inProgress';
}

/** 매칭의 두 당사자. 취소한 사람을 식별자 대신 이 값으로 기록한다. */
export type MatchParty = 'guardian' | 'caregiver';

export const MatchPartyLabels: Record<MatchParty, string> = {
  guardian: '보호자',
  caregiver: '간병인',
};

/**
 * 간병을 끊은 쪽.
 *
 * 당사자 둘에 관리자가 더해진다. MatchParty 를 넓히지 않고 따로 둔 것은,
 * MatchParty 가 "지금 이 화면을 누가 보고 있는가"로도 쓰이기 때문이다 —
 * 관리자는 당사자 화면을 보지 않는다.
 *
 * 관리자가 끊은 간병을 '보호자가 취소'로 보여 주면, 당사자에게 상대가 그만둔 것으로
 * 읽힌다. 실제로 일어난 일과 다른 문장이라 값을 따로 갖는다.
 */
export type MatchCanceller = MatchParty | 'admin';

export const MatchCancellerLabels: Record<MatchCanceller, string> = {
  guardian: '보호자',
  caregiver: '간병인',
  admin: '관리자',
};

/**
 * 상대방 정보.
 *
 * 연락처는 매칭이 성사되어 있는 동안에만 들어 있다.
 * 취소된 매칭에서는 이름도 가려진 채로(김OO) 내려온다 —
 * 가리는 일은 화면이 아니라 데이터가 나오는 지점에서 한다.
 */
export type MatchContact = {
  name: string;
  phone?: string;
};

/** 간병인이 매칭 이후에 보는 환자 정보. 특이사항이 여기서 처음 열린다. */
export type MatchedPatient = PatientSummary & {
  careNotes?: string;
};

/** 매칭 화면이 쓰는 간병 조건. 요청 행에서 그대로 가져온다. */
export type MatchCareSummary = Pick<
  CareRequest,
  | 'requestText'
  | 'careType'
  | 'region'
  | 'startDate'
  | 'endDate'
  | 'dailyStartTime'
  | 'dailyEndTime'
  | 'requiredSkills'
  | 'budgetPerDay'
>;

/**
 * 매칭 한 건.
 *
 * 상태가 바뀐 시각을 한 칸에 덮어쓰지 않고 각각 남긴다.
 * updatedAt 하나만 두면 "언제 시작했는지"를 나중에 되찾을 수 없다.
 */
export type Match = {
  id: string;
  requestId: string;
  guardianId: string;
  caregiverId: string;
  status: MatchStatus;
  acceptedAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  /** 끊은 쪽. 화면에는 식별자가 아니라 '보호자가 취소'처럼 보여 준다. */
  cancelledBy?: MatchCanceller;
  cancelReason?: string;
  /**
   * 노쇼로 신고된 시각.
   *
   * 신고한 사람은 담지 않는다. 노쇼는 언제나 보호자가 신고하며(간병인이 자기 결석을
   * 신고할 일은 없다), 저장소에는 누가 눌렀는지 남아 있다.
   */
  noShowAt?: string;
  /** 보호자가 남긴 상황 설명 */
  noShowNote?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * 화면이 보는 매칭.
 *
 * 목록 한 줄을 그리는 데 필요한 것 — 간병 조건, 환자, 상대방 — 을 매칭에 붙여서 함께 내려준다.
 * 보호자와 간병인이 같은 모양을 쓰고, 어느 쪽에서 보는지는 `caregiverId`/`guardianId` 를
 * 로그인한 사용자와 비교해서 정한다.
 */
export type CareMatch = Match & {
  care: MatchCareSummary;
  patient: MatchedPatient;
  /** 간병인 쪽 정보. 보호자 화면에서 상대방으로 쓴다. */
  caregiver: MatchContact;
  /** 보호자 쪽 정보. 간병인 화면에서 상대방으로 쓴다. */
  guardian: MatchContact;
};

/** 로그인한 사용자에게 상대방은 누구인가 */
export function counterpartOf(match: CareMatch, userId: string): MatchContact {
  return match.caregiverId === userId ? match.guardian : match.caregiver;
}

// --- AI 자연어 구조화 -----------------------------------------------------------

/**
 * 원문이 얼마나 분명했는지.
 * 대부분을 추측해야 했다면 low 이며, 화면은 이때 "확인해 주세요" 안내를 함께 보여 준다.
 */
export type AiConfidence = 'high' | 'medium' | 'low';

/** AI 가 읽어 낸 간병 장소. 판단할 근거가 없으면 'unknown' */
export type AiCarePlace = CareType | 'unknown';

export type AiSchedule = {
  /** YYYY-MM-DD */
  startDate?: string;
  endDate?: string;
  /** HH:MM */
  dailyStartTime?: string;
  dailyEndTime?: string;
  /** 특정 요일만 필요한 경우. 매일이거나 언급이 없으면 비어 있다. */
  weekdays: Weekday[];
  /** 날짜로 옮기기 어려운 표현 그대로 ("퇴원할 때까지", "주 3회") */
  note?: string;
};

/**
 * 보호자가 적은 원문을 AI 가 정리한 조건.
 *
 * 폼에서 사람이 고른 값(CareRequest 의 컬럼들)을 대체하지 않는다. 두 값은 따로 보관하며,
 * 어긋날 때 무엇이 사람의 선택이었는지 되짚을 수 있어야 하기 때문이다.
 * 매칭 점수 계산(src/lib/matching.ts)도 지금은 사람이 고른 값만 본다.
 *
 * 저장 위치는 `care_requests.ai_conditions` (JSONB) 이고, 형태는 Edge Function 의
 * supabase/functions/structure-care-request/schema.ts 가 강제한다.
 */
export type AiCareConditions = {
  /** 시군구 단위 지역 */
  location?: string;
  carePlace: AiCarePlace;
  /** 환자 상태와 필요한 간병 종류 ("치매", "거동 불편" …). 자유 문구다. */
  careType: string[];
  /** 원문에서 분명히 드러난 간병 역량. src/lib/care-options.ts 목록 안의 값만 들어온다. */
  requiredSkills: string[];
  schedule: AiSchedule;
  genderPreference: CaregiverGenderPreference;
  /** 하루 기준 예산(원) */
  budgetPerDay?: number;
  /** 위 항목에 담기지 않은 특이사항 */
  additionalNotes?: string;
  confidence: AiConfidence;
};

export const AiConfidenceLabels: Record<AiConfidence, string> = {
  high: '원문에서 대부분 확인했습니다',
  medium: '일부는 짐작해서 정리했습니다',
  low: '원문만으로는 분명하지 않아 대부분 비워 두었습니다',
};

export const AiCarePlaceLabels: Record<AiCarePlace, string> = {
  hospital: CareTypeLabels.hospital,
  home: CareTypeLabels.home,
  facility: CareTypeLabels.facility,
  unknown: '장소 미확인',
};

/** 정리된 결과에 보여 줄 내용이 하나라도 있는지. 전부 비었으면 카드를 띄우지 않는다. */
export function hasAiConditions(conditions: AiCareConditions): boolean {
  const { location, careType, requiredSkills, schedule, budgetPerDay, additionalNotes } = conditions;

  return Boolean(
    location ||
      careType.length > 0 ||
      requiredSkills.length > 0 ||
      schedule.startDate ||
      schedule.dailyStartTime ||
      schedule.weekdays.length > 0 ||
      schedule.note ||
      budgetPerDay !== undefined ||
      additionalNotes
  );
}

// --- 후기와 신뢰도 -------------------------------------------------------------

/** 별점의 범위. 화면과 저장소가 같은 값을 보도록 한 곳에 둔다. */
export const MinRating = 1;
export const MaxRating = 5;

/** 별점 하나하나에 붙는 뜻. 색이나 개수만으로 고르게 하지 않는다. */
export const RatingLabels: Record<number, string> = {
  1: '많이 아쉬웠습니다',
  2: '아쉬웠습니다',
  3: '보통이었습니다',
  4: '좋았습니다',
  5: '매우 좋았습니다',
};

/**
 * 내가 쓴 후기, 또는 내가 받은 후기의 원본.
 *
 * 당사자 두 사람만 이 모양으로 읽는다. 남에게 보여 줄 때는 작성자를 가린
 * PublicReview 를 쓴다.
 */
export type Review = {
  id: string;
  /** 후기는 사람이 아니라 함께한 간병 한 건에 달린다 */
  matchId: string;
  reviewerId: string;
  revieweeId: string;
  /** 1~5 */
  rating: number;
  comment?: string;
  createdAt: string;
  /**
   * 관리자가 지운 후기면 그 시각.
   *
   * 행을 실제로 지우지 않는 이유는 두 가지다. 지우면 매칭당 한 번이라는 제약이 풀려
   * 삭제 후 재작성으로 후기 수정이 우회되고, 분쟁 기록도 함께 사라진다.
   * 평가받은 사람의 목록과 평균에서는 빠지지만, 작성자 본인에게는 삭제된 사실이 보인다.
   */
  deletedAt?: string;
};

/**
 * 남에게 보여 주는 후기.
 *
 * 작성자 이름은 성만 남기고(김OO), 어느 간병 건이었는지는 담지 않는다 —
 * 매칭을 되짚으면 환자가 드러나기 때문이다.
 */
export type PublicReview = {
  id: string;
  rating: number;
  comment?: string;
  createdAt: string;
  reviewerName: string;
};

/**
 * 사람이 받은 평가의 요약.
 *
 * 평균을 프로필 컬럼으로 들고 있지 않고 그때그때 센다.
 * 저장해 두면 후기가 바뀔 때마다 두 값이 어긋나고, 어긋난 평균은 아무도 알아차리지 못한다.
 */
export type UserRating = {
  /** 후기가 없으면 없음 */
  ratingAvg?: number;
  reviewCount: number;
};

export const EmptyRating: UserRating = { reviewCount: 0 };

/** 후기 작성 화면이 채우는 값 */
export type ReviewInput = {
  rating: number;
  comment?: string;
};

/** '4.3 (12건)'. 후기가 없으면 그 사실을 그대로 말한다 — 0.0 으로 보이면 나쁜 평가로 읽힌다. */
export function formatRating(rating: UserRating): string {
  return rating.ratingAvg !== undefined
    ? `${rating.ratingAvg.toFixed(1)} (${rating.reviewCount}건)`
    : '아직 받은 후기 없음';
}

// --- 교육과 수료 ---------------------------------------------------------------

/**
 * 교육 과정 한 건.
 *
 * 과정 내용은 앱이 아니라 데이터베이스에 있다. 교육 자료는 앱 배포와 상관없이
 * 늘어나고 고쳐지는 것이라, 번들에 박아 두면 문장 하나 고치는 데 심사를 기다려야 한다.
 *
 * 목록에 필요한 만큼만 담는다. 교육 내용(lessons)과 퀴즈 문항은 과정을 열 때 따로 받는다.
 */
export type TrainingCourse = {
  id: string;
  /** 사람이 읽을 수 있는 과정 이름(dementia-care …). 시연 데이터와 스키마가 이 값으로 짝을 맞춘다. */
  slug: string;
  title: string;
  summary: string;
  /**
   * 수료하면 프로필에 함께 보이는 자격 이름. 없는 과정도 있다.
   * 간병인이 직접 고른 자격(CaregiverProfile.certifications)과 섞지 않는다 —
   * 한쪽은 본인이 신고한 값이고 이쪽은 앱이 확인한 값이라, 합쳐 두면 어느 쪽이 확인된 것인지 알 수 없다.
   */
  certificationLabel?: string;
  /** 교육 내용을 읽는 데 걸리는 대략의 시간(분) */
  estimatedMinutes: number;
  /** 합격 기준. 맞힌 문항 비율(0~100)이 이 값 이상이어야 수료한다. */
  passScore: number;
  /** 퀴즈 문항 수. 세어서 내려오는 값이라 저장하지 않는다. */
  questionCount: number;
};

/** 교육 내용 한 단원 */
export type TrainingLesson = {
  id: string;
  /** 1부터. 읽는 순서다. */
  order: number;
  title: string;
  body: string;
  /** 이 단원에서 꼭 기억할 것. 본문을 끝까지 읽지 못해도 이것만은 남는다. */
  keyPoints: string[];
};

export type TrainingCourseDetail = TrainingCourse & {
  lessons: TrainingLesson[];
};

/**
 * 퀴즈 문항.
 *
 * 정답이 들어 있지 않다. 채점은 화면이 아니라 저장소가 한다 —
 * 앱이 "맞혔습니다"라고 보낸 값을 믿으면 아무나 수료증을 만들 수 있다.
 */
export type QuizQuestion = {
  id: string;
  order: number;
  question: string;
  /** 보기. 배열 순서가 곧 보기 번호이며 번호는 1부터 센다. */
  choices: string[];
};

/** 한 문항에 고른 답. choiceIndex 는 1부터다. */
export type QuizAnswer = {
  questionId: string;
  choiceIndex: number;
};

/** 채점 결과 한 문항 */
export type QuizQuestionResult = {
  questionId: string;
  /** 고르지 않고 낸 문항에는 없다 */
  selectedIndex?: number;
  answerIndex: number;
  isCorrect: boolean;
  /** 왜 그 답인지. 틀린 문항뿐 아니라 맞은 문항에도 보여 준다 — 찍어서 맞힌 것을 배운 것으로 두지 않는다. */
  explanation: string;
};

/**
 * 응시 한 번의 결과.
 *
 * 점수(0~100)만 남기지 않고 맞힌 개수와 전체 문항 수를 함께 남긴다.
 * 나중에 문항이 늘거나 줄면 비율만으로는 그때 무엇을 풀었는지 되짚을 수 없다.
 */
export type QuizAttempt = {
  id: string;
  courseId: string;
  correctCount: number;
  questionCount: number;
  /** 0~100 */
  score: number;
  passed: boolean;
  createdAt: string;
};

/**
 * 수료 한 건.
 *
 * 과정당 한 줄만 남는다. 이미 수료한 과정을 다시 풀어 더 높은 점수를 받아도
 * 수료일은 처음 합격한 날 그대로다 — 수료는 "언제 이 교육을 마쳤는가"의 기록이라
 * 나중 응시로 날짜가 밀리면 이력으로서 뜻을 잃는다.
 */
export type TrainingCompletion = {
  id: string;
  courseId: string;
  /** 수료를 만든 응시 */
  attemptId: string;
  completedAt: string;
};

/** 퀴즈를 내고 받은 결과 */
export type QuizGrade = {
  attempt: QuizAttempt;
  results: QuizQuestionResult[];
  /** 이번 응시로 처음 수료했는지. 이미 수료한 과정을 다시 풀어 붙으면 false 다. */
  isNewCompletion: boolean;
  /** 수료했다면 그 시각. 이번에 붙었든 전에 붙었든 처음 합격한 날이다. */
  completedAt?: string;
};

/** '5문항 중 4문항 정답 · 80점' */
export function formatQuizScore(attempt: Pick<QuizAttempt, 'correctCount' | 'questionCount' | 'score'>): string {
  return `${attempt.questionCount}문항 중 ${attempt.correctCount}문항 정답 · ${attempt.score}점`;
}

// --- 신고와 관리자 조치 ---------------------------------------------------------

/**
 * 후기를 신고하는 사유.
 *
 * '기타' 하나로 받지 않고 나눈다. 관리자가 무엇을 확인해야 하는지가 사유마다 다르기
 * 때문이다 — 욕설은 문장을 읽으면 되지만, 사실과 다르다는 신고는 간병 기록까지 봐야 한다.
 */
export type ReviewReportReason = 'abuse' | 'falseInfo' | 'privacy' | 'spam' | 'other';

export const ReviewReportReasons: ReviewReportReason[] = [
  'abuse',
  'falseInfo',
  'privacy',
  'spam',
  'other',
];

export const ReviewReportReasonLabels: Record<ReviewReportReason, string> = {
  abuse: '욕설이나 비방',
  falseInfo: '사실과 다른 내용',
  privacy: '개인정보가 드러남',
  spam: '광고나 도배',
  other: '그 밖의 사유',
};

/**
 * 신고의 처리 상태.
 *
 * accepted 는 신고한 사람 편에서 "받아들여졌다"는 뜻이다 — 후기가 지워졌다.
 * 신고당한 작성자에게는 알리지 않는다. 반려된 신고까지 알리면 신고가 곧 시비가 된다.
 */
export type ReviewReportStatus = 'open' | 'accepted' | 'dismissed';

export const ReviewReportStatusLabels: Record<ReviewReportStatus, string> = {
  open: '확인 중',
  accepted: '후기 삭제됨',
  dismissed: '반려됨',
};

/** 신고 화면이 채우는 값 */
export type ReviewReportInput = {
  reason: ReviewReportReason;
  detail?: string;
};

/** 내가 낸 신고. 어떻게 처리되었는지는 본인만 본다. */
export type ReviewReport = {
  id: string;
  reviewId: string;
  reason: ReviewReportReason;
  detail?: string;
  status: ReviewReportStatus;
  createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
};

/**
 * 관리자 신고 큐의 한 줄.
 *
 * 신고 한 줄이 아니라 신고·후기·사람 셋을 이어 붙인 것이다. 판단에는 셋이 모두 필요하고,
 * 앱이 나눠 조회해서 스스로 잇게 두면 그 사이에 다른 관리자가 후기를 지울 수 있다.
 *
 * 이름을 가리지 않는 유일한 창구다. 관리자는 누가 누구에게 무엇을 썼는지 봐야 판단할 수 있다.
 */
export type AdminReviewReport = {
  reportId: string;
  reviewId: string;
  matchId: string;
  reason: ReviewReportReason;
  detail?: string;
  status: ReviewReportStatus;
  createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
  /** 같은 후기에 달린 신고 수. 한 줄만 보고는 알 수 없다. */
  reportCount: number;
  reporterId: string;
  reporterName: string;

  /** 신고당한 후기 */
  rating: number;
  comment?: string;
  reviewCreatedAt: string;
  /** 이미 지워졌으면 그 시각. 지워진 뒤에도 큐에서 사라지지 않는다. */
  reviewDeletedAt?: string;
  reviewerId: string;
  reviewerName: string;
  revieweeId: string;
  revieweeName: string;
};

/** 관리자가 손대야 하는 매칭의 종류 */
export type DisputedMatchKind = 'noShow' | 'overdue';

export const DisputedMatchKindLabels: Record<DisputedMatchKind, string> = {
  noShow: '노쇼 신고됨',
  overdue: '종료일 지남',
};

export const DisputedMatchKindDescriptions: Record<DisputedMatchKind, string> = {
  noShow: '보호자가 간병인이 오지 않았다고 신고했습니다. 신고가 잘못되었다면 되돌릴 수 있습니다.',
  overdue: '끝날 날이 지났는데 아직 살아 있는 간병입니다. 양쪽 모두 상태를 옮기지 않았습니다.',
};

/**
 * 관리자 화면이 보는 매칭.
 *
 * match_details 뷰(당사자용)와 달리 환자 정보와 연락처가 담기지 않는다.
 * 관리자가 판단하는 데 필요한 것은 "누구와 누구의 언제 간병인가"까지다.
 */
export type DisputedMatch = {
  kind: DisputedMatchKind;
  matchId: string;
  requestId: string;
  status: MatchStatus;
  region: string;
  startDate: string;
  endDate?: string;
  acceptedAt: string;
  startedAt?: string;
  noShowAt?: string;
  noShowNote?: string;
  guardianId: string;
  guardianName: string;
  caregiverId: string;
  caregiverName: string;
};

/** 관리자가 한 조치의 종류 */
export type AdminActionType =
  | 'reviewDeleted'
  | 'reviewRestored'
  | 'reportDismissed'
  | 'noShowCleared'
  | 'matchCancelled';

export const AdminActionLabels: Record<AdminActionType, string> = {
  reviewDeleted: '후기 삭제',
  reviewRestored: '후기 복구',
  reportDismissed: '신고 반려',
  noShowCleared: '노쇼 신고 취소',
  matchCancelled: '매칭 강제 종료',
};

export type AdminActionTargetType = 'review' | 'reviewReport' | 'match';

/**
 * 관리자가 한 일 한 줄.
 *
 * 조치한 자리에는 결과만 남고 판단은 남지 않는다 — 노쇼 신고를 되돌리면 노쇼였다는
 * 사실 자체가 매칭에서 사라지고, 일반 취소와 구분되지 않는다.
 * 무슨 일이 있었는지는 이 기록에만 있다.
 */
export type AdminAction = {
  id: string;
  /** 조치한 관리자. 계정이 지워지면 비어 있지만 기록 자체는 남는다. */
  adminId?: string;
  action: AdminActionType;
  targetType: AdminActionTargetType;
  targetId: string;
  note?: string;
  createdAt: string;
};
