import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, Card, Screen } from '@/components/common';
import { useAuthStore } from '@/store/use-auth-store';
import { Spacing } from '@/theme';
import { RoleLabels } from '@/types';

export type RoleHomeProps = {
  /** 사용자에게 이 화면에서 무엇을 할 수 있는지 알려주는 한 문장 */
  description: string;
  /** 다음 Phase에서 붙일 기능 목록 — 지금은 안내만 한다 */
  nextSteps: { title: string; detail: string }[];
};

/**
 * 유형별 홈 화면의 공통 골격.
 *
 * Phase 2에서는 로그인한 사용자 정보와 앞으로 붙을 기능만 보여준다.
 * 실제 기능은 각 Phase에서 이 화면의 목록을 대체하며 채워진다.
 */
export function RoleHome({ description, nextSteps }: RoleHomeProps) {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);

  if (!user) {
    return null;
  }

  return (
    <Screen
      scroll
      edges={['bottom']}
      footer={
        <AppButton
          title="로그아웃"
          variant="outline"
          onPress={() => {
            void signOut();
          }}
          disabled={isSubmitting}
        />
      }>
      <View style={styles.greeting}>
        <AppText variant="title">{user.name} 님, 안녕하세요</AppText>
        <AppText variant="body" tone="secondary">
          {description}
        </AppText>
      </View>

      <Card>
        <AppText variant="label" tone="secondary">
          계정 정보
        </AppText>
        <AppText variant="body">{user.email}</AppText>
        <AppText variant="body" tone="secondary">
          이용 유형: {RoleLabels[user.role]}
        </AppText>
        {user.phone ? (
          <AppText variant="body" tone="secondary">
            연락처: {user.phone}
          </AppText>
        ) : null}
      </Card>

      <View style={styles.section}>
        <AppText variant="heading">곧 추가될 기능</AppText>
        {nextSteps.map((step) => (
          <Card key={step.title}>
            <AppText variant="subheading">{step.title}</AppText>
            <AppText variant="caption" tone="secondary">
              {step.detail}
            </AppText>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: {
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  section: {
    gap: Spacing.md,
  },
});
