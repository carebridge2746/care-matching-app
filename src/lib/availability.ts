import { addDays, isValidIsoDate, isValidTime } from '@/lib/date';
import {
  CareTimeSlotLabels,
  CareTimeSlots,
  Weekdays,
  type AvailabilitySlot,
  type CareTimeSlot,
  type Weekday,
} from '@/types';

/**
 * 가능 시간표 다루기.
 *
 * 시간표는 켜진 칸만 모아 둔 목록(AvailabilitySlot[])으로 들고 다닌다.
 * 7×3 배열로 두지 않은 이유는 저장소(Supabase의 caregiver_availability 행)와 모양이 같아서
 * 화면 ↔ 저장소 사이에 변환이 필요 없기 때문이다.
 *
 * 목록의 순서는 의미가 없으므로, 비교하거나 저장하기 전에는 항상 sortSlots 로 맞춘다.
 */

export function hasSlot(
  slots: AvailabilitySlot[],
  weekday: Weekday,
  slot: CareTimeSlot
): boolean {
  return slots.some((item) => item.weekday === weekday && item.slot === slot);
}

/** 켜져 있으면 끄고, 꺼져 있으면 켠다 */
export function toggleSlot(
  slots: AvailabilitySlot[],
  weekday: Weekday,
  slot: CareTimeSlot
): AvailabilitySlot[] {
  if (hasSlot(slots, weekday, slot)) {
    return slots.filter((item) => !(item.weekday === weekday && item.slot === slot));
  }
  return sortSlots([...slots, { weekday, slot }]);
}

/**
 * 요일 하나를 통째로 켜거나 끈다.
 * 하나라도 켜져 있으면 그 요일을 쉬는 날로 만들고, 아니면 종일 가능으로 만든다.
 */
export function toggleWeekday(slots: AvailabilitySlot[], weekday: Weekday): AvailabilitySlot[] {
  const rest = slots.filter((item) => item.weekday !== weekday);

  if (rest.length !== slots.length) {
    return rest;
  }

  return sortSlots([...slots, ...CareTimeSlots.map((slot) => ({ weekday, slot }))]);
}

/** 요일 → 시간대 순으로 정렬한다 */
export function sortSlots(slots: AvailabilitySlot[]): AvailabilitySlot[] {
  return [...slots].sort(
    (a, b) =>
      Weekdays.indexOf(a.weekday) - Weekdays.indexOf(b.weekday) ||
      CareTimeSlots.indexOf(a.slot) - CareTimeSlots.indexOf(b.slot)
  );
}

/** 그 요일에 켜진 시간대만 골라 돌려준다 */
export function slotsForWeekday(
  slots: AvailabilitySlot[],
  weekday: Weekday
): CareTimeSlot[] {
  return CareTimeSlots.filter((slot) => hasSlot(slots, weekday, slot));
}

/**
 * '주 5일 · 오전, 오후' 처럼 한 줄로 요약한다.
 * 아직 아무 칸도 켜지 않았으면 null 을 돌려주고, 문구는 화면이 정한다.
 */
export function summarizeAvailability(slots: AvailabilitySlot[]): string | null {
  if (slots.length === 0) {
    return null;
  }

  const dayCount = Weekdays.filter((weekday) =>
    slots.some((item) => item.weekday === weekday)
  ).length;

  const usedSlots = CareTimeSlots.filter((slot) => slots.some((item) => item.slot === slot));

  return `주 ${dayCount}일 · ${usedSlots.map((slot) => CareTimeSlotLabels[slot]).join(', ')}`;
}

// --- 요청 조건 → 시간표 좌표 ---------------------------------------------------

/** 'YYYY-MM-DD' 가 무슨 요일인지. 형식이 잘못됐으면 null */
export function weekdayOfIsoDate(isoDate: string): Weekday | null {
  if (!isValidIsoDate(isoDate)) {
    return null;
  }

  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
  // getDay()는 일요일이 0이고, 우리 표는 월요일부터 시작한다
  return Weekdays[(date.getDay() + 6) % 7] ?? null;
}

/**
 * 간병 기간에 들어가는 요일.
 *
 * 일주일 이상이면 모든 요일이 들어가므로 최대 7일까지만 훑는다.
 * 종료일이 없으면(미정) 매일 필요한 것으로 본다.
 */
export function weekdaysInPeriod(startDate: string, endDate?: string): Weekday[] {
  if (!endDate) {
    return [...Weekdays];
  }

  const found: Weekday[] = [];
  let cursor = startDate;

  for (let index = 0; index < 7 && cursor <= endDate; index += 1) {
    const weekday = weekdayOfIsoDate(cursor);
    if (weekday && !found.includes(weekday)) {
      found.push(weekday);
    }
    cursor = addDays(cursor, 1);
  }

  return found.length > 0 ? found : [...Weekdays];
}

/** 시간대가 덮는 구간(분 단위). 야간은 자정을 넘어가므로 두 토막이다. */
const SlotRanges: Record<CareTimeSlot, [number, number][]> = {
  morning: [[360, 720]],
  afternoon: [[720, 1080]],
  night: [
    [1080, 1440],
    [0, 360],
  ],
};

function toMinutes(time: string): number | null {
  if (!isValidTime(time)) {
    return null;
  }
  const [hour, minute] = time.split(':').map(Number);
  return (hour ?? 0) * 60 + (minute ?? 0);
}

function overlaps(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/**
 * 'HH:MM ~ HH:MM' 이 걸치는 시간대를 모두 돌려준다.
 *
 * 야간 간병은 끝 시각이 시작보다 이를 수 있어서(18:00 ~ 06:00) 구간을 두 토막으로 나눈다.
 * 시각을 정하지 않은 요청(협의)은 빈 배열을 돌려준다 — "아무 때나"와 "정한 시간이 없다"는 다르다.
 */
export function slotsForTimeRange(startTime?: string, endTime?: string): CareTimeSlot[] {
  if (!startTime || !endTime) {
    return [];
  }

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);

  if (start === null || end === null) {
    return [];
  }
  // 시작과 끝이 같으면 24시간 간병이다
  if (start === end) {
    return [...CareTimeSlots];
  }

  const ranges: [number, number][] =
    end > start
      ? [[start, end]]
      : [
          [start, 1440],
          [0, end],
        ];

  return CareTimeSlots.filter((slot) =>
    SlotRanges[slot].some((slotRange) => ranges.some((range) => overlaps(range, slotRange)))
  );
}
