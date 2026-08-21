import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/app-text';
import { hasSlot, slotsForWeekday, toggleSlot, toggleWeekday } from '@/lib/availability';
import { Colors, Layout, Radius, Spacing } from '@/theme';
import {
  CareTimeSlotHours,
  CareTimeSlotLabels,
  CareTimeSlots,
  WeekdayLabels,
  Weekdays,
  type AvailabilitySlot,
} from '@/types';

export type AvailabilityGridProps = {
  value: AvailabilitySlot[];
  onChange: (slots: AvailabilitySlot[]) => void;
};

/**
 * 요일 × 시간대 가능 시간표.
 *
 * 칸마다 시간대 이름을 그대로 적는다. 체크 표시만 두면 어느 칸이 무엇인지 세어 봐야 하는데,
 * 고령 사용자가 함께 쓰는 화면에서 그런 표는 읽기 어렵다.
 * 요일 이름을 누르면 그 요일이 통째로 켜지고 꺼진다 — 주 5일 근무를 한 번에 넣기 위해서다.
 */
export function AvailabilityGrid({ value, onChange }: AvailabilityGridProps) {
  return (
    <View style={styles.container}>
      {Weekdays.map((weekday) => {
        const selectedCount = slotsForWeekday(value, weekday).length;

        return (
          <View key={weekday} style={styles.row}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                selectedCount > 0 ? `${WeekdayLabels[weekday]} 전체 끄기` : `${WeekdayLabels[weekday]} 종일 가능`
              }
              onPress={() => onChange(toggleWeekday(value, weekday))}
              style={({ pressed }) => [styles.weekday, pressed && styles.pressed]}>
              <AppText variant="bodyStrong" tone={selectedCount > 0 ? 'brand' : 'secondary'}>
                {WeekdayLabels[weekday].slice(0, 1)}
              </AppText>
            </Pressable>

            {CareTimeSlots.map((slot) => {
              const selected = hasSlot(value, weekday, slot);

              return (
                <Pressable
                  key={slot}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={`${WeekdayLabels[weekday]} ${CareTimeSlotLabels[slot]}`}
                  onPress={() => onChange(toggleSlot(value, weekday, slot))}
                  style={({ pressed }) => [
                    styles.cell,
                    selected && styles.cellSelected,
                    pressed && styles.pressed,
                  ]}>
                  <AppText variant="body" tone={selected ? 'inverse' : 'tertiary'}>
                    {CareTimeSlotLabels[slot]}
                  </AppText>
                </Pressable>
              );
            })}
          </View>
        );
      })}

      <View style={styles.legend}>
        {CareTimeSlots.map((slot) => (
          <AppText key={slot} variant="caption" tone="tertiary">
            {CareTimeSlotLabels[slot]} {CareTimeSlotHours[slot]}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: Spacing.sm,
  },
  weekday: {
    width: 44,
    minHeight: Layout.minTouchHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: Layout.borderWidth,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.subtle,
  },
  cell: {
    flex: 1,
    minHeight: Layout.minTouchHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.md,
    borderWidth: Layout.borderWidth,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.card,
  },
  cellSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  pressed: {
    opacity: 0.85,
  },
  legend: {
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
  },
});
