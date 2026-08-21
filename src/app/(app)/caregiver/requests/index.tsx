import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { CaregiverRequestCard } from '@/components/care';
import { AppText, Card, EmptyState, LoadingView, Screen } from '@/components/common';
import { rankRequestsForCaregiver } from '@/lib/matching';
import { useAuthStore } from '@/store/use-auth-store';
import { useCaregiverProfileStore } from '@/store/use-caregiver-profile-store';
import { useCaregiverRequestsStore } from '@/store/use-caregiver-requests-store';
import { Spacing } from '@/theme';

/**
 * 대기 중인 간병 요청 목록.
 *
 * 프로필을 등록했으면 나에게 잘 맞는 요청이 위로 온다. 점수 계산은 보호자 화면의
 * 추천 목록과 같은 규칙(src/lib/matching.ts)을 쓰므로 양쪽이 같은 숫자를 본다.
 *
 * 화면에 돌아올 때마다 다시 불러온다 — 목록을 띄워 둔 사이에 다른 간병인이
 * 먼저 수락했을 수 있고, 없어진 요청을 눌러 보게 두면 안 되기 때문이다.
 */
export default function AvailableRequestsScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const available = useCaregiverRequestsStore((state) => state.available);
  const isLoading = useCaregiverRequestsStore((state) => state.isLoading);
  const errorMessage = useCaregiverRequestsStore((state) => state.errorMessage);
  const load = useCaregiverRequestsStore((state) => state.load);

  const profile = useCaregiverProfileStore((state) => state.profile);
  const loadProfile = useCaregiverProfileStore((state) => state.load);

  const caregiverId = user?.id;

  useFocusEffect(
    useCallback(() => {
      if (caregiverId) {
        void load(caregiverId);
        void loadProfile(caregiverId);
      }
    }, [caregiverId, load, loadProfile])
  );

  const ranked = useMemo(
    () => rankRequestsForCaregiver(available, profile),
    [available, profile]
  );

  if (isLoading && available.length === 0) {
    return <LoadingView message="간병 요청을 불러오는 중입니다" />;
  }

  return (
    <Screen scroll edges={['bottom']}>
      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}

      {available.length === 0 ? (
        <EmptyState
          title="지금은 대기 중인 요청이 없습니다"
          description="보호자가 새 간병 요청을 올리면 이 목록에 바로 나타납니다. 잠시 뒤 다시 확인해 주세요."
          actionTitle="수락한 간병 보기"
          onAction={() => router.push('/caregiver/accepted')}
        />
      ) : (
        <>
          {profile ? (
            <AppText variant="body" tone="secondary">
              내 역량·지역·가능 시간과 잘 맞는 요청이 위에 있습니다. 수락하면 바로 매칭이
              확정됩니다.
            </AppText>
          ) : (
            <Card onPress={() => router.push('/caregiver/profile')}>
              <AppText variant="subheading">프로필을 등록해 주세요</AppText>
              <AppText variant="body" tone="secondary">
                등록하면 나에게 잘 맞는 요청이 위로 올라옵니다.
              </AppText>
            </Card>
          )}

          {ranked.map(({ request, score }) => (
            <View key={request.id} style={styles.item}>
              <CaregiverRequestCard
                request={request}
                matchScore={score?.isEligible ? score.total : undefined}
                onPress={() => router.push(`/caregiver/requests/${request.id}`)}
              />
              {score && !score.isEligible ? (
                <AppText variant="caption" tone="danger">
                  조건이 맞지 않습니다 — {score.excludedReason}
                </AppText>
              ) : null}
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  item: {
    gap: Spacing.xs,
  },
});
