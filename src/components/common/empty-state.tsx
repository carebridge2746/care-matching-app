import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { Colors, Layout, Radius, Spacing } from '@/theme';

export type EmptyStateProps = {
  title: string;
  description: string;
  /** 비어 있을 때 바로 할 수 있는 다음 행동 */
  actionTitle?: string;
  onAction?: () => void;
};

/**
 * 목록이 비었을 때 보여주는 안내.
 * "없습니다"로 끝내지 않고 다음에 무엇을 하면 되는지까지 알려준다.
 */
export function EmptyState({ title, description, actionTitle, onAction }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      <AppText variant="subheading" center>
        {title}
      </AppText>
      <AppText variant="body" tone="secondary" center>
        {description}
      </AppText>
      {actionTitle && onAction ? (
        <AppButton title={actionTitle} onPress={onAction} style={styles.action} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    borderWidth: Layout.borderWidth,
    borderStyle: 'dashed',
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.card,
  },
  action: {
    alignSelf: 'stretch',
    marginTop: Spacing.xs,
  },
});
