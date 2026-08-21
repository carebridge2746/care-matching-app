import type {
  CareRequest,
  CaregiverCareRequest,
  CareType,
  CaregiverGenderPreference,
} from '@/types';

/**
 * 간병 요청 어댑터의 계약.
 *
 * 화면과 저장소는 이 타입에만 의존한다.
 * 구현은 로컬 Mock(care-requests.mock.ts)과 Supabase(care-requests.supabase.ts) 두 가지다.
 *
 * 보호자용 메서드(list/create/cancel/remove)와 간병인용 메서드(listAvailable/listAccepted/accept)를
 * 한 어댑터에 둔다. 같은 테이블을 보는 두 시선일 뿐이고, 갈라 두면 상태 값의 의미가
 * 두 곳에서 어긋나기 쉽기 때문이다. 대신 간병인용 메서드는 보호자 식별 정보를 빼고 돌려준다.
 */

/** 요청 작성 화면이 채우는 값. 상태는 항상 pending으로 시작한다. */
export type CareRequestInput = {
  patientId: string;
  /** 보호자가 평소 말하듯 적은 원문 */
  requestText: string;
  careType: CareType;
  /** 매칭 대상 지역 (시군구 단위) */
  region: string;
  /** YYYY-MM-DD */
  startDate: string;
  endDate?: string;
  /** HH:MM */
  dailyStartTime?: string;
  dailyEndTime?: string;
  requiredSkills: string[];
  preferredCaregiverGender: CaregiverGenderPreference;
  /** 일당 예산(원) */
  budgetPerDay?: number;
};

export type CareRequestsAdapter = {
  /** 보호자가 올린 요청 목록. 최근에 올린 순서로 돌려준다. */
  list: (guardianId: string) => Promise<CareRequest[]>;
  create: (guardianId: string, input: CareRequestInput) => Promise<CareRequest>;
  /**
   * 요청을 취소 상태로 바꾼다.
   * 이미 매칭된 요청은 지우지 않고 취소로 남긴다 — 매칭·평가 기록이 이 행에 이어지기 때문이다.
   */
  cancel: (id: string) => Promise<CareRequest>;
  /** 아직 매칭되지 않은(pending) 요청만 지울 수 있다 */
  remove: (id: string) => Promise<void>;

  /**
   * 간병인이 지금 수락할 수 있는 요청(pending) 목록.
   * 최근에 올라온 순서로 돌려준다.
   */
  listAvailable: (caregiverId: string) => Promise<CaregiverCareRequest[]>;
  /** 이 간병인이 수락한 요청 목록. 수락한 순서의 역순으로 돌려준다. */
  listAccepted: (caregiverId: string) => Promise<CaregiverCareRequest[]>;
  /**
   * 대기 중인 요청을 수락해 matched 로 바꾼다.
   *
   * 먼저 수락한 간병인이 가져간다. 두 사람이 동시에 눌렀다면 나중 쪽은
   * `invalid_state` 로 거절되며, 이 판정은 화면이 아니라 저장소에서 이뤄진다.
   */
  accept: (id: string, caregiverId: string) => Promise<CaregiverCareRequest>;
};
