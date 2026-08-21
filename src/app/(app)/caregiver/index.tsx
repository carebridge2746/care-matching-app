import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { CaregiverRequestCard } from '@/components/care';
import { AppButton, AppText, Card, Screen } from '@/components/common';
import { summarizeAvailability } from '@/lib/availability';
import { useAuthStore } from '@/store/use-auth-store';
import { useCaregiverProfileStore } from '@/store/use-caregiver-profile-store';
import { useCaregiverRequestsStore } from '@/store/use-caregiver-requests-store';
import { Spacing } from '@/theme';

/**
 * 간병인 홈.
 *
 * 화면 순서가 곧 해야 할 일의 순서다 — 프로필을 등록하고, 가능 시간을 정하고, 요청을 받는다.
 * 앞의 두 가지가 비어 있으면 그 카드가 다음에 할 일을 알려 준다.
 *
 * 요청은 다른 간병인이 먼저 가져갈 수 있으므로 화면에 돌아올 때마다 다시 불러온다.
 */
export default function CaregiverHomeScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const isSigningOut = useAuthStore((state) => state.isSubmitting);

  const available = useCaregiverRequestsStore((state) => state.available);
  const accepted = useCaregiverRequestsStore((state) => state.accepted);
  const requestsError = useCaregiverRequestsStore((state) => state.errorMessage);
  const loadRequests = useCaregiverRequestsStore((state) => state.load);

  const profile = useCaregiverProfileStore((state) => state.profile);
  const loadProfile = useCaregiverProfileStore((state) => state.load);

  const caregiverId = user?.id;

  useFocusEffect(
    useCallback(() => {
      if (caregiverId) {
        void loadRequests(caregiverId);
        void loadProfile(caregiverId);
      }
    }, [caregiverId, loadProfile, loadRequests])
  );

  if (!user) {
    return null;
  }

  const [latest] = available;
  const availabilitySummary = profile ? summarizeAvailability(profile.availability) : null;
  const isReady = Boolean(profile) && Boolean(availabilitySummary);

  const greeting = !profile
    ? '프로필과 역량을 등록하면 조건이 맞는 간병 요청을 추천받을 수 있습니다.'
    : !availabilitySummary
      ? '근무할 수 있는 요일과 시간대를 설정해 주세요. 매칭에 함께 쓰입니다.'
      : available.length > 0
        ? `지금 수락할 수 있는 간병 요청이 ${available.length}건 있습니다.`
        : '지금은 대기 중인 간병 요청이 없습니다. 새 요청이 올라오면 여기에 표시됩니다.';

  return (
    <Screen
      scroll
      edges={['bottom']}
      footer={
        <>
          <AppButton
            title={isReady ? '간병 요청 찾기' : '프로필 등록하기'}
            onPress={() => router.push(isReady ? '/caregiver/requests' : '/caregiver/profile')}
          />
          <AppButton
            title="로그아웃"
            variant="outline"
            disabled={isSigningOut}
            onPress={() => {
              void signOut();
            }}
          />
        </>
      }>
      <View style={styles.greeting}>
        <AppText variant="title">{user.name} 님, 안녕하세요</AppText>
        <AppText variant="body" tone="secondary">
          {greeting}
        </AppText>
      </View>

      {requestsError ? (
        <AppText variant="body" tone="danger">
          {requestsError}
        </AppText>
      ) : null}

      <Card onPress={() => router.push('/caregiver/profile')}>
        <AppText variant="subheading">프로필과 역량</AppText>
        <AppText variant="body" tone="secondary">
          {profile
            ? `경력 ${profile.yearsOfExperience}년 · 역량 ${profile.skills.length}개 · ${profile.regions.join(', ')}`
            : '아직 등록하지 않았습니다'}
        </AppText>
      </Card>

      <Card onPress={() => router.push('/caregiver/availability')}>
        <AppText variant="subheading">가능 시간</AppText>
        <AppText variant="body" tone="secondary">
          {availabilitySummary ?? '아직 설정하지 않았습니다'}
        </AppText>
      </Card>

      <Card onPress={() => router.push('/caregiver/requests')}>
        <AppText variant="subheading">간병 요청 찾기</AppText>
        <AppText variant="body" tone="secondary">
          {available.length > 0 ? `대기중 ${available.length}건` : '대기중인 요청 없음'}
        </AppText>
      </Card>

      <Card onPress={() => router.push('/caregiver/accepted')}>
        <AppText variant="subheading">수락한 간병</AppText>
        <AppText variant="body" tone="secondary">
          {accepted.length > 0 ? `${accepted.length}건 진행 예정` : '아직 수락한 요청이 없습니다'}
        </AppText>
      </Card>

      {latest ? (
        <View style={styles.section}>
          <AppText variant="heading">가장 최근 요청</AppText>
          <CaregiverRequestCard
            request={latest}
            onPress={() => router.push(`/caregiver/requests/${latest.id}`)}
          />
        </View>
      ) : null}
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
