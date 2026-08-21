import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { CaregiverRequestCard } from '@/components/care';
import { AppText, EmptyState, LoadingView, Screen } from '@/components/common';
import { useAuthStore } from '@/store/use-auth-store';
import { useCaregiverRequestsStore } from '@/store/use-caregiver-requests-store';

/**
 * 대기 중인 간병 요청 목록.
 *
 * 보호자가 올린 요청 중 아직 아무도 수락하지 않은 것만 보인다.
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

  const caregiverId = user?.id;

  useFocusEffect(
    useCallback(() => {
      if (caregiverId) {
        void load(caregiverId);
      }
    }, [caregiverId, load])
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
          <AppText variant="body" tone="secondary">
            수락하면 바로 매칭이 확정됩니다. 먼저 수락한 간병인에게 배정됩니다.
          </AppText>
          {available.map((request) => (
            <CaregiverRequestCard
              key={request.id}
              request={request}
              onPress={() => router.push(`/caregiver/requests/${request.id}`)}
            />
          ))}
        </>
      )}
    </Screen>
  );
}
