import { readJson, writeJson } from '@/lib/storage';
import type { CareRequest, CaregiverProfile, Patient } from '@/types';

/**
 * Mock 모드의 로컬 저장소.
 *
 * 환자와 간병 요청은 서로를 필요로 한다 — 환자를 지우면 그 환자의 요청도 사라지고,
 * 간병인 화면은 요청에 환자 요약을 붙여서 보여 준다.
 * 두 어댑터가 서로를 import 하면 순환 참조가 되므로, 저장소 접근만 이 파일에 모아 둔다.
 *
 * Supabase 모드에서는 같은 자리를 데이터베이스가 맡는다.
 * 여기서는 사용자별로 파일을 나누지 않고 한 저장소에 모두 담는데,
 * 그래야 보호자가 올린 요청을 간병인 계정으로 로그인해서 그대로 볼 수 있다.
 */

const PatientsKey = 'careapp.mock.patients';
const CareRequestsKey = 'careapp.mock.care-requests';
const CaregiverProfilesKey = 'careapp.mock.caregiver-profiles';

/** 어댑터가 흉내 내는 네트워크 지연. 화면의 로딩 표시까지 확인하기 위한 값이다. */
export const NetworkDelayMs = 300;

export function delay(ms: number = NetworkDelayMs): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadPatients(): Promise<Patient[]> {
  return (await readJson<Patient[]>(PatientsKey)) ?? [];
}

export async function savePatients(patients: Patient[]): Promise<void> {
  await writeJson(PatientsKey, patients);
}

export async function loadCareRequests(): Promise<CareRequest[]> {
  return (await readJson<CareRequest[]>(CareRequestsKey)) ?? [];
}

export async function saveCareRequests(requests: CareRequest[]): Promise<void> {
  await writeJson(CareRequestsKey, requests);
}

export async function loadCaregiverProfiles(): Promise<CaregiverProfile[]> {
  return (await readJson<CaregiverProfile[]>(CaregiverProfilesKey)) ?? [];
}

export async function saveCaregiverProfiles(profiles: CaregiverProfile[]): Promise<void> {
  await writeJson(CaregiverProfilesKey, profiles);
}
