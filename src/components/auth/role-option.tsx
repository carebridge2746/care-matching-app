import { StyleSheet, View } from 'react-native';

import { AppText, Card } from '@/components/common';
import { Colors, Layout, Radius, Spacing } from '@/theme';
import { RoleLabels, type UserRole } from '@/types';

export type RoleOptionProps = {
  role: UserRole;
  description: string;
  selected: boolean;
  onSelect: (role: UserRole) => void;
};

/**
 * 회원가입에서 사용자 유형을 고르는 카드.
 * 선택 여부를 테두리 색만이 아니라 '선택됨' 표시로도 알린다.
 */
export function RoleOption({ role, description, selected, onSelect }: RoleOptionProps) {
  return (
    <Card selected={selected} onPress={() => onSelect(role)}>
      <View style={styles.header}>
        <AppText variant="subheading">{RoleLabels[role]}</AppText>
        <View style={[styles.marker, selected && styles.markerSelected]}>
          {selected ? (
            <AppText variant="caption" tone="inverse" style={styles.markerLabel}>
              선택됨
            </AppText>
          ) : null}
        </View>
      </View>
      <AppText variant="caption" tone="secondary">
        {description}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    minHeight: Spacing.xxl,
  },
  marker: {
    minWidth: Spacing.xxl,
    minHeight: Spacing.xl,
    borderRadius: Radius.pill,
    borderWidth: Layout.borderWidth,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
  },
  markerSelected: {
    backgroundColor: Colors.brand.primary,
    borderColor: Colors.brand.primary,
  },
  markerLabel: {
    fontWeight: '700',
  },
});
