/**
 * 날짜 다루기.
 *
 * 저장 형식은 언제나 `YYYY-MM-DD` 문자열이다.
 * Date 객체를 그대로 저장하면 기기 시간대에 따라 하루가 밀리는 문제가 생긴다.
 */

const IsoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const TimePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** Date → 'YYYY-MM-DD' (기기의 현지 날짜 기준) */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function today(now: Date = new Date()): string {
  return toIsoDate(now);
}

/** 'YYYY-MM-DD' 에 며칠을 더한다 */
export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

/** 형식뿐 아니라 실제로 있는 날짜인지도 본다 (2026-02-31 은 거부) */
export function isValidIsoDate(value: string): boolean {
  if (!IsoDatePattern.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return false;
  }

  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  );
}

export function isValidTime(value: string): boolean {
  return TimePattern.test(value);
}

/** 'YYYY-MM-DD' → '2026년 9월 1일 (화)' */
export function formatKoreanDate(isoDate: string): string {
  if (!isValidIsoDate(isoDate)) {
    return isoDate;
  }

  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];

  return `${year}년 ${month}월 ${day}일 (${weekday})`;
}

/** 두 날짜 사이의 기간을 사람이 읽는 문장으로 (종료일이 없으면 '미정') */
export function formatPeriod(startDate: string, endDate?: string): string {
  const start = formatKoreanDate(startDate);
  return endDate ? `${start} ~ ${formatKoreanDate(endDate)}` : `${start} ~ 종료일 미정`;
}
