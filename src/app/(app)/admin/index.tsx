import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, Card, Screen } from '@/components/common';
import { useAdminStore } from '@/store/use-admin-store';
import { useAuthStore } from '@/store/use-auth-store';
import { useLocationSharingStore } from '@/store/use-location-sharing-store';
import { Spacing } from '@/theme';

/**
 * 관리자 홈.
 *
 * 처리를 기다리는 건수를 먼저 보여 준다. 관리자 창구는 매일 들여다보는 곳이 아니라
 * 일이 생겼을 때 여는 곳이라, 열자마자 "지금 할 일이 있는가"가 보여야 한다.
 *
 * 사용자 목록이나 전체 매칭 현황은 두지 않는다. 열어 두면 남의 간병 내용을 아무 때나
 * 읽는 자리가 된다 — 관리자가 보는 것은 누군가 문제를 제기한 건뿐이다.
 */
export default function AdminHomeScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const isSigningOut = useAuthStore((state) => state.isSubmitting);

  const reports = useAdminStore((state) => state.reports);
  const reportStatus = useAdminStore((state) => state.reportStatus);
  const isLoadingReports = useAdminStore((state) => state.isLoadingReports);
  const disputedMatches = useAdminStore((state) => state.disputedMatches);
  const isLoadingDisputed = useAdminStore((state) => state.isLoadingDisputed);
  const errorMessage = useAdminStore((state) => state.errorMessage);
  const loadReports = useAdminStore((state) => state.loadReports);
  const loadDisputedMatches = useAdminStore((state) => state.loadDisputedMatches);

  const watch = useLocationSharingStore((state) => state.watch);
  const loadWatch = useLocationSharingStore((state) => state.loadWatch);

  // 다른 관리자가 처리했거나 새 신고가 들어왔을 수 있으므로 돌아올 때마다 다시 센다
  useFocusEffect(
    useCallback(() => {
      void loadReports('open');
      void loadDisputedMatches();
      void loadWatch();
    }, [loadDisputedMatches, loadReports, loadWatch])
  );

  if (!user) {
    return null;
  }

  // 신고 화면에서 다른 탭을 보다 돌아온 직후에는 목록이 아직 '확인 중'이 아닐 수 있다
  const openCount = reportStatus === 'open' && !isLoadingReports ? reports.length : null;
  const noShowCount = disputedMatches.filter((match) => match.kind === 'noShow').length;
  const overdueCount = disputedMatches.length - noShowCount;
  const needsConfirmationCount = watch.filter((item) => item.assessment === 'needsConfirmation').length;
  const delayedCount = watch.filter((item) => item.assessment === 'delayed').length;

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
          disabled={isSigningOut}
        />
      }>
      <View style={styles.greeting}>
        <AppText variant="title">{user.name} 님, 안녕하세요</AppText>
        <AppText variant="body" tone="secondary">
          당사자가 문제를 제기한 후기와 매칭을 확인하고 처리합니다. 모든 조치는 기록으로
          남습니다.
        </AppText>
      </View>

      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}

      <Card onPress={() => router.push('/admin/reports')}>
        <AppText variant="subheading">후기 신고</AppText>
        <AppText variant="body" tone={openCount ? 'danger' : 'secondary'}>
          {openCount === null
            ? '확인 중인 신고를 세는 중입니다'
            : openCount > 0
              ? `확인을 기다리는 신고 ${openCount}건`
              : '확인을 기다리는 신고가 없습니다'}
        </AppText>
      </Card>

      <Card onPress={() => router.push('/admin/matches')}>
        <AppText variant="subheading">확인이 필요한 매칭</AppText>
        <AppText variant="body" tone={disputedMatches.length > 0 ? 'danger' : 'secondary'}>
          {isLoadingDisputed && disputedMatches.length === 0
            ? '매칭을 확인하는 중입니다'
            : disputedMatches.length > 0
              ? `노쇼 신고 ${noShowCount}건 · 종료일 지남 ${overdueCount}건`
              : '확인이 필요한 매칭이 없습니다'}
        </AppText>
      </Card>

      {/* 안심 도착 (Phase 13) — 도착 확인은 확인이 필요한 매칭 화면 맨 위에 모아 둔다 */}
      <Card onPress={() => router.push('/admin/matches')}>
        <AppText variant="subheading">도착 확인</AppText>
        <AppText variant="body" tone={needsConfirmationCount > 0 ? 'danger' : 'secondary'}>
          {watch.length > 0
            ? `확인 필요 ${needsConfirmationCount}건 · 지연 가능성 ${delayedCount}건 · 전체 ${watch.length}건`
            : '지금 도착을 기다리는 간병이 없습니다'}
        </AppText>
      </Card>

      <Card onPress={() => router.push('/admin/actions')}>
        <AppText variant="subheading">조치 기록</AppText>
        <AppText variant="body" tone="secondary">
          누가 언제 무엇을 지우고 되돌렸는지 확인합니다
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  greeting: {
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
});
