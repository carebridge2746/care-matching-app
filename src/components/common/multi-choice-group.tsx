import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/app-text';
import { Colors, Layout, Radius, Spacing } from '@/theme';

export type MultiChoiceGroupProps = {
  label: string;
  /** 자주 쓰는 항목 목록. 사용자는 여기서 여러 개를 고를 수 있다. */
  options: readonly string[];
  values: string[];
  onChange: (values: string[]) => void;
  helperText?: string;
  error?: string | null;
};

/**
 * 여러 개를 고르는 선택지 묶음 (질환, 필요한 간병 역량 등).
 *
 * 자유 입력 대신 정해진 목록에서 고르게 한다.
 * 사람마다 다르게 적으면(예: '치매' / '인지저하') 매칭에서 같은 조건으로 볼 수 없기 때문이다.
 */
export function MultiChoiceGroup({
  label,
  options,
  values,
  onChange,
  helperText,
  error,
}: MultiChoiceGroupProps) {
  const description = error ?? helperText;

  const toggle = (option: string) => {
    onChange(
      values.includes(option)
        ? values.filter((value) => value !== option)
        : [...values, option]
    );
  };

  return (
    <View style={styles.container}>
      <AppText variant="label" tone="secondary">
        {label}
      </AppText>

      <View style={styles.options}>
        {options.map((option) => {
          const selected = values.includes(option);

          return (
            <Pressable
              key={option}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={option}
              onPress={() => toggle(option)}
              style={({ pressed }) => [
                styles.chip,
                selected && styles.chipSelected,
                pressed && styles.pressed,
              ]}>
              <AppText variant="body" tone={selected ? 'inverse' : 'primary'}>
                {selected ? `✓ ${option}` : option}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      {description ? (
        <AppText variant="caption" tone={error ? 'danger' : 'tertiary'}>
          {description}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    minHeight: Layout.minTouchHeight,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    borderWidth: Layout.borderWidth,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.card,
  },
  chipSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  pressed: {
    opacity: 0.85,
  },
});
