import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { CaregiverRequestCard } from '@/components/care';
import { AppText, EmptyState, LoadingView, Screen } from '@/components/common';
import { useAuthStore } from '@/store/use-auth-store';
import { useCaregiverRequestsStore } from '@/store/use-caregiver-requests-store';

/**
 * 수락한 간병 목록.
 *
 * 매칭이 확정된 요청이므로 환자 성함이 가려지지 않은 채로 보인다.
 * 간병 진행 기록(출근·인계·완료)은 Phase 7에서 이 화면에 붙는다.
 */
export default function AcceptedRequestsScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const accepted = useCaregiverRequestsStore((state) => state.accepted);
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

  if (isLoading && accepted.length === 0) {
    return <LoadingView message="수락한 간병을 불러오는 중입니다" />;
  }

  return (
    <Screen scroll edges={['bottom']}>
      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}

      {accepted.length === 0 ? (
        <EmptyState
          title="아직 수락한 간병이 없습니다"
          description="대기 중인 요청을 살펴보고 조건이 맞는 간병을 수락해 보세요."
          actionTitle="간병 요청 찾기"
          onAction={() => router.replace('/caregiver/requests')}
        />
      ) : (
        <>
          <AppText variant="body" tone="secondary">
            매칭이 확정된 간병입니다. 보호자 화면에도 매칭 완료로 표시됩니다.
          </AppText>
          {accepted.map((request) => (
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
