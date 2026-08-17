import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppText } from '@/components/common/app-text';
import { Colors, Layout, Radius, Spacing } from '@/theme';

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'danger';

export type AppButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * 큰 터치 영역과 명확한 라벨을 가진 기본 버튼.
 * 아이콘만 있는 버튼은 만들지 않는다 — 고령 사용자를 위해 항상 텍스트를 노출한다.
 */
export function AppButton({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  style,
}: AppButtonProps) {
  const isInactive = disabled || loading;
  const isFilled = variant === 'primary' || variant === 'danger';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive, busy: loading }}
      disabled={isInactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        pressed && !isInactive && styles.pressed,
        isInactive && (isFilled ? styles.disabledFilled : styles.disabledOutlined),
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={isFilled ? Colors.text.inverse : Colors.brand.primary} />
      ) : (
        <AppText
          variant="button"
          tone={isInactive ? 'tertiary' : isFilled ? 'inverse' : 'brand'}
          numberOfLines={1}>
          {title}
        </AppText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: Layout.minTouchHeight,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: Layout.borderWidth,
    borderColor: 'transparent',
  },
  pressed: {
    opacity: 0.75,
  },
  disabledFilled: {
    backgroundColor: Colors.surface.subtle,
    borderColor: 'transparent',
  },
  disabledOutlined: {
    backgroundColor: Colors.surface.subtle,
    borderColor: Colors.surface.border,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: Colors.brand.primary,
  },
  secondary: {
    backgroundColor: Colors.brand.primarySoft,
  },
  outline: {
    backgroundColor: Colors.surface.card,
    borderColor: Colors.brand.primary,
  },
  danger: {
    backgroundColor: Colors.feedback.error,
  },
});
