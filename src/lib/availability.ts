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
