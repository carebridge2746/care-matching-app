import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { AdminActionItem } from '@/components/admin';
import { AppText, EmptyState, LoadingView, Screen } from '@/components/common';
import { useAdminStore } from '@/store/use-admin-store';

/**
 * 조치 기록.
 *
 * 읽기만 한다. 기록을 지우거나 고치는 창구는 앱 어디에도 없다 —
 * 관리자가 한 일을 관리자가 지울 수 있으면 기록으로서 뜻이 없다.
 */
export default function AdminActionsScreen() {
  const actions = useAdminStore((state) => state.actions);
  const isLoading = useAdminStore((state) => state.isLoadingActions);
  const errorMessage = useAdminStore((state) => state.errorMessage);
  const load = useAdminStore((state) => state.loadActions);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (isLoading && actions.length === 0) {
    return <LoadingView message="조치 기록을 불러오는 중입니다" />;
  }

  return (
    <Screen scroll edges={['bottom']}>
      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}

      {actions.length === 0 ? (
        <EmptyState
          title="아직 조치한 기록이 없습니다"
          description="후기를 지우거나 되돌리고, 신고를 반려하고, 매칭을 정리하면 한 줄씩 남습니다."
        />
      ) : (
        <AppText variant="caption" tone="secondary">
          최근 {actions.length}건을 보여 줍니다.
        </AppText>
      )}

      {actions.map((action) => (
        <AdminActionItem key={action.id} action={action} />
      ))}
    </Screen>
  );
}
