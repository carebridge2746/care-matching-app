import { mockCareRequestsAdapter } from '@/api/care-requests.mock';
import type { CareRequestInput } from '@/api/care-requests.types';
import { mockMatchHistoryAdapter } from '@/api/match-history.mock';
import { mockPatientsAdapter } from '@/api/patients.mock';
import type { PatientInput } from '@/api/patients.types';
import { addDays, today } from '@/lib/date';
import type { CareMatch, CareRequest, Patient } from '@/types';

/**
 * 테스트가 함께 쓰는 시연 계정과 자료 만들기.
 *
 * id 는 src/api/auth.mock.ts 의 시연 계정과, 프로필은 src/api/caregiver.demo.ts 와 짝이 맞는다.
 * 자료는 저장소에 직접 쓰지 않고 어댑터로 만든다 — 그래야 만드는 규칙까지 함께 지나간다.
 */

/** 보호자 김영희 */
export const Guardian = 'mock-guardian-1';
/** 간병인 이미영 — 병원·시설 / 강남·서초 / 평일 오전·오후 프로필이 미리 들어 있다 */
export const Caregiver = 'mock-caregiver-2';
/** 간병인 최동해 — 재가만 / 송파. 병원 요청에서는 제외 조건에 걸린다 */
export const HomeCaregiver = 'mock-caregiver-3';
/** 간병인 박정수 — 프로필이 없다. 요청은 수락할 수 있지만 추천 후보는 아니다 */
export const NewCaregiver = 'mock-caregiver-1';
export const Admin = 'mock-admin-1';

/** 오늘로부터 며칠 뒤(음수면 며칠 전)의 'YYYY-MM-DD' */
export function daysFromToday(days: number): string {
  return addDays(today(), days);
}

export async function seedPatient(input: Partial<PatientInput> = {}): Promise<Patient> {
  return mockPatientsAdapter.create(Guardian, {
    name: '김순자',
    birthYear: 1945,
    gender: 'female',
    conditions: ['치매'],
    mobility: 'assisted',
    cognition: 'mild',
    careNotes: '저녁 약을 꼭 챙겨 주세요',
    ...input,
  });
}

/**
 * 환자를 따로 넘기지 않으면 새 환자를 만들어 붙인다.
 * 시작일 기본값은 오늘이다 — 시작일 전에는 간병을 시작할 수 없어서, 진행 흐름을 보는 테스트가
 * 날짜를 따로 적지 않아도 되게 한다.
 */
export async function seedRequest(input: Partial<CareRequestInput> = {}): Promise<CareRequest> {
  const patientId = input.patientId ?? (await seedPatient()).id;

  return mockCareRequestsAdapter.create(Guardian, {
    requestText: '어머니 병원 간병을 부탁드립니다. 치매가 있으십니다.',
    careType: 'hospital',
    region: '서울 강남구',
    startDate: daysFromToday(0),
    requiredSkills: ['식사 보조'],
    preferredCaregiverGender: 'any',
    ...input,
    patientId,
  });
}

/** 요청과 간병인으로 매칭을 찾는다. 기본은 보호자 쪽에서 본 모양이다. */
export async function findMatch(
  requestId: string,
  caregiverId: string,
  viewerId: string = Guardian
): Promise<CareMatch> {
  const list =
    viewerId === Guardian
      ? await mockMatchHistoryAdapter.listForGuardian(Guardian)
      : await mockMatchHistoryAdapter.listForCaregiver(viewerId);

  const match = list.find((item) => item.requestId === requestId && item.caregiverId === caregiverId);
  if (!match) {
    throw new Error(`매칭을 찾지 못했습니다: ${requestId} / ${caregiverId}`);
  }
  return match;
}

/** 요청을 수락하고, 그렇게 생긴 매칭을 보호자 쪽에서 읽어 온다 */
export async function acceptRequest(
  requestId: string,
  caregiverId: string = Caregiver
): Promise<CareMatch> {
  await mockCareRequestsAdapter.accept(requestId, caregiverId);
  return findMatch(requestId, caregiverId);
}

/**
 * 안심 도착을 쓸 수 있는 수락된 간병 한 건 (Phase 13).
 * 시작일을 어제로 두어 공유 시간대 안에 들고, 시작 시각이 지난 상태를 만든다.
 */
export async function seedAcceptedMatchForArrival(
  input: Partial<CareRequestInput> = {},
  caregiverId: string = Caregiver
): Promise<CareMatch> {
  const request = await seedRequest({ startDate: daysFromToday(-1), ...input });
  return acceptRequest(request.id, caregiverId);
}

/** 끝난 간병 한 건. 후기는 끝난 간병에만 남길 수 있다. */
export async function seedCompletedMatch(caregiverId: string = Caregiver): Promise<CareMatch> {
  const request = await seedRequest({
    startDate: daysFromToday(-3),
    endDate: daysFromToday(-1),
  });
  const match = await acceptRequest(request.id, caregiverId);
  await mockMatchHistoryAdapter.start(match.id, caregiverId);
  return mockMatchHistoryAdapter.complete(match.id, Guardian);
}
