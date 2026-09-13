import {
  slotsForTimeRange,
  summarizeAvailability,
  toggleSlot,
  toggleWeekday,
  weekdayOfIsoDate,
  weekdaysInPeriod,
} from '@/lib/availability';
import type { AvailabilitySlot } from '@/types';

describe('시간표 편집', () => {
  it('칸을 켜면 요일 → 시간대 순으로 정렬되고, 다시 누르면 꺼진다', () => {
    let slots: AvailabilitySlot[] = [];
    slots = toggleSlot(slots, 'wed', 'night');
    slots = toggleSlot(slots, 'mon', 'afternoon');
    slots = toggleSlot(slots, 'mon', 'morning');

    expect(slots).toEqual([
      { weekday: 'mon', slot: 'morning' },
      { weekday: 'mon', slot: 'afternoon' },
      { weekday: 'wed', slot: 'night' },
    ]);
    expect(toggleSlot(slots, 'wed', 'night')).toHaveLength(2);
  });

  it('요일 전체 토글 — 비어 있으면 종일, 하나라도 켜져 있으면 쉬는 날', () => {
    const allDay = toggleWeekday([], 'tue');
    expect(allDay.map((item) => item.slot)).toEqual(['morning', 'afternoon', 'night']);

    const partlyOn: AvailabilitySlot[] = [{ weekday: 'tue', slot: 'night' }];
    expect(toggleWeekday(partlyOn, 'tue')).toEqual([]);
  });

  it('한 줄 요약', () => {
    expect(summarizeAvailability([])).toBeNull();
    expect(
      summarizeAvailability([
        { weekday: 'sat', slot: 'night' },
        { weekday: 'mon', slot: 'morning' },
        { weekday: 'mon', slot: 'night' },
      ])
    ).toBe('주 2일 · 오전, 야간');
  });
});

describe('요청 조건 → 시간표 좌표', () => {
  it.each([
    ['2026-09-14', 'mon'],
    ['2026-09-20', 'sun'],
    ['2026-02-31', null],
    ['2026/09/14', null],
  ])('%s 는 %s', (date, expected) => {
    expect(weekdayOfIsoDate(date)).toBe(expected);
  });

  it('간병 기간에 들어가는 요일', () => {
    expect(weekdaysInPeriod('2026-09-14', '2026-09-16')).toEqual(['mon', 'tue', 'wed']);
    // 일주일이 넘으면 모든 요일
    expect(weekdaysInPeriod('2026-09-14', '2026-10-14')).toHaveLength(7);
    // 종료일 미정이면 매일 필요한 것으로 본다
    expect(weekdaysInPeriod('2026-09-14')).toHaveLength(7);
  });

  it.each([
    ['09:00', '17:00', ['morning', 'afternoon']],
    ['13:00', '17:00', ['afternoon']],
    ['18:00', '06:00', ['night']],
    ['22:00', '09:00', ['morning', 'night']],
    ['08:00', '08:00', ['morning', 'afternoon', 'night']],
  ])('%s ~ %s 는 %j 에 걸친다', (start, end, expected) => {
    expect(slotsForTimeRange(start, end)).toEqual(expected);
  });

  it('시각을 정하지 않았거나 형식이 틀리면 빈 배열 — "아무 때나"와 "정한 시간이 없다"는 다르다', () => {
    expect(slotsForTimeRange()).toEqual([]);
    expect(slotsForTimeRange('09:00')).toEqual([]);
    expect(slotsForTimeRange('9시', '18:00')).toEqual([]);
  });
});
