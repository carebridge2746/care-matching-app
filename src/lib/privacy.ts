/**
 * 개인정보 가리기.
 *
 * 간병인은 요청을 수락할지 판단하는 데 필요한 만큼만 볼 수 있어야 한다.
 * 매칭이 확정되기 전에는 환자의 이름을 알 필요가 없으므로 성만 남기고 가린다.
 *
 * Supabase 모드에서는 같은 규칙을 데이터베이스의 `public.mask_person_name()` 이 수행한다.
 * 가리는 일을 화면이 아니라 데이터가 나오는 지점에서 하기 위해서다 —
 * 화면에서 가리면 가려지지 않은 값이 이미 기기까지 내려온 뒤다.
 */

import type { Match } from '@/types';

/**
 * 끝난 간병의 연락처를 열어 두는 기간(일).
 *
 * 마무리 연락과 재의뢰를 할 여유를 두고, 그 뒤로는 취소된 매칭처럼 상대 이름과 연락처,
 * 환자 특이사항, 요청 원문을 다시 가린다. Supabase 쪽 match_details 뷰(schema.sql 69)와
 * 같은 값이어야 한다.
 */
export const ContactRetentionDays = 30;

const DayMs = 24 * 60 * 60 * 1000;

/**
 * 이 매칭에서 상대의 연락처와 환자 특이사항을 볼 수 있는지.
 *
 * 성사되지 않은 매칭(취소·노쇼)은 닫혀 있고, 끝난 간병은 종료 뒤 ContactRetentionDays 동안만 열려 있다.
 * 자기 자신의 자료는 이 판정과 무관하게 언제나 보인다 — 그 구분은 부르는 쪽이 한다.
 */
export function isContactOpen(
  match: Pick<Match, 'status' | 'completedAt'>,
  now: Date = new Date()
): boolean {
  if (match.status === 'cancelled' || match.status === 'noShow') {
    return false;
  }
  if (match.status === 'completed' && match.completedAt) {
    return now.getTime() < new Date(match.completedAt).getTime() + ContactRetentionDays * DayMs;
  }
  return true;
}

/**
 * 간병 기록이 남아 있어 행을 지우지 않고 익명화한 환자의 이름.
 * Supabase 쪽 remove_patient()(schema.sql 67)가 같은 문자열을 적는다.
 */
export const AnonymizedPatientName = '삭제된 환자';

/** '김영희' → '김OO'. 한 글자 이름은 그대로 둔다. */
export function maskPersonName(name: string): string {
  const trimmed = name.trim();

  if (trimmed.length <= 1) {
    return trimmed;
  }

  return `${trimmed.slice(0, 1)}${'O'.repeat(trimmed.length - 1)}`;
}
