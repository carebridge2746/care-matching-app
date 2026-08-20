import { Redirect, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, Card, Screen } from '@/components/common';
import { homeRouteForRole } from '@/lib/routes';
import { useAuthStore } from '@/store/use-auth-store';
import { Spacing } from '@/theme';
import { RoleLabels, type UserRole } from '@/types';

const RoleDescriptions: Record<UserRole, string> = {
  guardian: '간병 요청을 작성하고 추천받은 간병인과 연결됩니다.',
  caregiver: '역량과 가능 시간을 등록하고 요청을 수락합니다.',
  admin: '사용자, 요청, 매칭 현황을 관리합니다.',
};

const Roles: UserRole[] = ['guardian', 'caregiver', 'admin'];

/**
 * 앱 진입 화면.
 *
 * 로그인한 사용자는 이곳에 머무르지 않고 유형별 첫 화면으로 보낸다.
 * 사용자 유형 분기는 이 한 곳에서만 일어난다.
 */
export default function LandingScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  if (user) {
    return <Redirect href={homeRouteForRole(user.role)} />;
  }

  return (
    <Screen
      scroll
      footer={
        <>
          <AppButton title="시작하기" onPress={() => router.push('/sign-in')} />
          <AppButton
            title="회원가입"
            variant="outline"
            onPress={() => router.push('/sign-up')}
          />
        </>
      }>
      <View style={styles.hero}>
        <AppText variant="display">AI 간병 매칭</AppText>
        <AppText variant="body" tone="secondary">
          필요한 간병 내용을 평소 말하듯 적으면, AI가 조건을 정리하고 가장 적합한 간병인을
          찾아드립니다.
        </AppText>
      </View>

      <View style={styles.roleList}>
        <AppText variant="heading">이용 대상</AppText>
        {Roles.map((role) => (
          <Card key={role}>
            <AppText variant="subheading">{RoleLabels[role]}</AppText>
            <AppText variant="caption" tone="secondary">
              {RoleDescriptions[role]}
            </AppText>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingTop: Spacing.xxl,
    gap: Spacing.md,
  },
  roleList: {
    gap: Spacing.md,
  },
});
