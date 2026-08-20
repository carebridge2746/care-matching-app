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
  createdAt: string;
  updatedAt: string;
};
