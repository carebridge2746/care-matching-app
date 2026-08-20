import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/app-text';
import { TextField } from '@/components/common/text-field';
import { addDays, formatKoreanDate, isValidIsoDate, today } from '@/lib/date';
import { Colors, Layout, Radius, Spacing } from '@/theme';

type QuickPick = { label: string; getValue: () => string };

const StartQuickPicks: QuickPick[] = [
  { label: '오늘', getValue: () => today() },
  { label: '내일', getValue: () => addDays(today(), 1) },
  { label: '다음 주', getValue: () => addDays(today(), 7) },
];

export type DateFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  helperText?: string;
  /** 종료일처럼 비워 둘 수 있는 항목이면 '미정' 버튼을 함께 보여준다 */
  clearable?: boolean;
};

/**
 * 날짜 입력.
 *
 * 네이티브 달력 대신 `YYYY-MM-DD` 직접 입력과 자주 쓰는 날짜 버튼을 함께 둔다.
 * 달력 컴포넌트는 웹과 네이티브 동작이 갈리고 추가 의존성이 필요해서,
 * MVP에서는 어디서나 똑같이 동작하는 방식을 골랐다.
 * 입력한 값이 실제로 있는 날짜인지는 아래에 한글로 되짚어 보여준다.
 */
export function DateField({
  label,
  value,
  onChange,
  error,
  helperText,
  clearable = false,
}: DateFieldProps) {
  const preview = isValidIsoDate(value) ? formatKoreanDate(value) : undefined;

  return (
    <View style={styles.container}>
      <TextField
        label={label}
        value={value}
        onChangeText={onChange}
        placeholder="2026-09-01"
        error={error}
        helperText={preview ?? helperText ?? '연도-월-일 순서로 적어 주세요.'}
        keyboardType="numbers-and-punctuation"
      />

      <View style={styles.quickPicks}>
        {StartQuickPicks.map((pick) => (
          <Pressable
            key={pick.label}
            accessibilityRole="button"
            onPress={() => onChange(pick.getValue())}
            style={({ pressed }) => [styles.pick, pressed && styles.pressed]}>
            <AppText variant="caption" tone="brand">
              {pick.label}
            </AppText>
          </Pressable>
        ))}

        {clearable ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => onChange('')}
            style={({ pressed }) => [styles.pick, pressed && styles.pressed]}>
            <AppText variant="caption" tone="secondary">
              미정
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  quickPicks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  pick: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    borderWidth: Layout.borderWidth,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.subtle,
  },
  pressed: {
    opacity: 0.75,
  },
});
