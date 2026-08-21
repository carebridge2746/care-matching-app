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
  /** 보호자에게 보여 줄 자기소개 */
  introduction?: string;
  /** 근무 가능한 요일·시간대. 비어 있으면 아직 설정하지 않은 것이다. */
  availability: AvailabilitySlot[];
  createdAt: string;
  updatedAt: string;
};
