import type { CareRequest, CareType, CaregiverGenderPreference } from '@/types';

/**
 * 간병 요청 어댑터의 계약.
 *
 * 화면과 저장소는 이 타입에만 의존한다.
 * 구현은 로컬 Mock(care-requests.mock.ts)과 Supabase(care-requests.supabase.ts) 두 가지다.
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
};
