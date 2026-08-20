import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/app-text';
import { Colors, Layout, Radius, Spacing } from '@/theme';

export type ChoiceOption<T extends string> = {
  value: T;
  label: string;
  /** 선택지가 무슨 뜻인지 한 줄로 덧붙일 때 */
  description?: string;
};

export type ChoiceGroupProps<T extends string> = {
  label: string;
  options: readonly ChoiceOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string | null;
  helperText?: string;
};

/**
 * 하나만 고르는 선택지 묶음.
 *
 * 드롭다운 대신 항목을 모두 펼쳐 둔다. 고령 사용자에게는 열어서 고르는 방식보다
 * 무엇이 있는지 한눈에 보이는 쪽이 낫다.
 */
export function ChoiceGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
  helperText,
}: ChoiceGroupProps<T>) {
  const description = error ?? helperText;

  return (
    <View style={styles.container}>
      <AppText variant="label" tone="secondary">
        {label}
      </AppText>

      <View style={styles.options}>
        {options.map((option) => {
          const selected = option.value === value;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={option.label}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.optionSelected,
                error && !selected ? styles.optionError : null,
                pressed && styles.pressed,
              ]}>
              <AppText variant="bodyStrong" tone={selected ? 'inverse' : 'primary'}>
                {option.label}
              </AppText>
              {option.description ? (
                <AppText variant="caption" tone={selected ? 'inverse' : 'secondary'}>
                  {option.description}
                </AppText>
              ) : null}
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
    gap: Spacing.sm,
  },
  option: {
    minHeight: Layout.minTouchHeight,
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: Layout.borderWidth,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.card,
  },
  optionSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  optionError: {
    borderColor: Colors.feedback.error,
  },
  pressed: {
    opacity: 0.85,
  },
});
