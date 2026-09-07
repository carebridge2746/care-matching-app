import { today as todayIsoDate } from '@/lib/date';
import type { CareMatch } from '@/types';

/**
 * 노쇼를 가려내는 규칙.
 *
 * 판정 자체는 저장소가 한다(Supabase 는 report_no_show(), Mock 은 match-history.mock.ts).
 * 여기 있는 것은 화면이 "지금 이 간병을 신고할 수 있는가"를 같은 기준으로 읽기 위한 함수들이다.
 *
 * 노쇼는 취소와 다르다. 취소는 못 오게 되었다고 알린 것이고, 노쇼는 알리지 않은 것이다.
 * 취소 기록에서 노쇼를 추론하면 미리 연락하고 그만둔 사람과 말없이 오지 않은 사람이
 * 같은 취급을 받게 되므로, 노쇼는 보호자가 직접 신고할 때만 남는다.
 */

/**
 * 시작일이 지났는데 아직 시작되지 않은 간병.
 *
 * 이것만으로 노쇼라고 부르지 않는다. 간병인이 와 있는데 시작 버튼만 누르지 않았을 수도 있고,
 * 보호자와 이야기가 되어 미룬 것일 수도 있다. 무슨 일이 있었는지는 보호자만 안다 —
 * 화면은 "확인이 필요합니다"까지만 말하고 판단은 사람에게 맡긴다.
 */
export function isMatchOverdue(match: CareMatch, today: string = todayIsoDate()): boolean {
  return match.status === 'accepted' && match.care.startDate < today;
}

/**
 * 노쇼로 신고할 수 있는 간병.
 *
 * 시작일 당일부터 신고할 수 있다. 시작일이 지나야만 신고할 수 있게 하면, 오늘 오기로 한
 * 간병인이 오지 않은 그날 — 대체 간병인이 가장 급한 날 — 에는 아무것도 할 수 없다.
 * 아직 오지 않은 날짜의 간병을 미리 신고하는 것만 막는다.
 *
 * 같은 판정을 저장소도 한다. 화면의 잠금은 안내이지 판정이 아니다.
 */
export function canReportNoShow(match: CareMatch, today: string = todayIsoDate()): boolean {
  return match.status === 'accepted' && match.care.startDate <= today;
}

/** 확인이 필요한 간병. 보호자 화면 맨 위에 모아 둔다. */
export function overdueMatches(matches: CareMatch[], today: string = todayIsoDate()): CareMatch[] {
  return matches.filter((match) => isMatchOverdue(match, today));
}

/**
 * 이 요청에서 오지 않은 간병인이 몇 명이었는지.
 *
 * 노쇼가 나면 요청은 곧바로 다시 대기중이 되므로 요청 행만 봐서는 무슨 일이 있었는지
 * 알 수 없다. 그 사실은 매칭 이력에만 남는다.
 */
export function noShowCountForRequest(matches: CareMatch[], requestId: string): number {
  return matches.filter((match) => match.requestId === requestId && match.status === 'noShow')
    .length;
}
