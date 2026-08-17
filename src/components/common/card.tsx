import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, Layout, Radius, Shadows, Spacing } from '@/theme';

export type CardProps = {
  children: ReactNode;
  /** 값을 주면 카드 전체가 눌리는 영역이 된다 */
  onPress?: () => void;
  /** 추천 간병인 카드처럼 선택된 상태를 강조할 때 */
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * 카드 기반 UI의 기본 단위.
 * 목록 항목, 요청 요약, 간병인 프로필 등 하나의 정보 단위를 표현할 때 사용한다.
 */
export function Card({ children, onPress, selected = false, style }: CardProps) {
  const cardStyle = [styles.card, selected && styles.selected, style];

  if (!onPress) {
    return <View style={cardStyle}>{children}</View>;
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [...cardStyle, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface.card,
    borderRadius: Radius.lg,
    borderWidth: Layout.borderWidth,
    borderColor: Colors.surface.border,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  selected: {
    borderColor: Colors.brand.primary,
    backgroundColor: Colors.brand.primarySoft,
  },
  pressed: {
    opacity: 0.85,
  },
});
