import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, Card, EmptyState, LoadingView, Screen, StatusBadge } from '@/components/common';
import { formatKoreanTimestamp, formatPeriod } from '@/lib/date';
import { useAuthStore } from '@/store/use-auth-store';
import { useCareRequestsStore } from '@/store/use-care-requests-store';
import { usePatientsStore } from '@/store/use-patients-store';
import { Spacing } from '@/theme';
import { CareTypeLabels, CaregiverGenderPreferenceLabels } from '@/types';

/**
 * 간병 요청 목록.
 *
 * 아직 매칭되지 않은(대기중) 요청만 삭제할 수 있다.
 * 매칭이 시작된 요청은 지우지 않고 취소로 남긴다 — 매칭·평가 기록이 이 요청에 이어지기 때문이다.
 * 같은 규칙이 데이터베이스 정책에도 걸려 있다.
 */
export default function CareRequestListScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const requests = useCareRequestsStore((state) => state.requests);
  const isLoading = useCareRequestsStore((state) => state.isLoading);
  const isSubmitting = useCareRequestsStore((state) => state.isSubmitting);
  const errorMessage = useCareRequestsStore((state) => state.errorMessage);
  const load = useCareRequestsStore((state) => state.load);
  const cancel = useCareRequestsStore((state) => state.cancel);
  const remove = useCareRequestsStore((state) => state.remove);

  const patients = usePatientsStore((state) => state.patients);
  const loadPatients = usePatientsStore((state) => state.load);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const guardianId = user?.id;

  // 화면에 돌아올 때마다 다시 불러온다. 간병인이 요청을 수락하면 상태가 바뀌기 때문이다.
  useFocusEffect(
    useCallback(() => {
      if (!guardianId) {
        return;
      }
      void load(guardianId);
      void loadPatients(guardianId);
    }, [guardianId, load, loadPatients])
  );

  if (isLoading && requests.length === 0) {
    return <LoadingView message="간병 요청을 불러오는 중입니다" />;
  }

  return (
    <Screen
      scroll
      edges={['bottom']}
      footer={
        <AppButton
          title="간병 요청 작성"
          onPress={() => router.push('/guardian/requests/new')}
          disabled={patients.length === 0}
        />
      }>
      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}

      {requests.length === 0 ? (
        <EmptyState
          title="올린 간병 요청이 없습니다"
          description={
            patients.length === 0
              ? '환자 정보를 먼저 등록하면 간병 요청을 올릴 수 있습니다.'
              : '필요한 간병 내용을 평소 말하듯 적으면 AI가 조건을 정리해 드립니다.'
          }
          actionTitle={patients.length === 0 ? '환자 등록' : '간병 요청 작성'}
          onAction={() =>
            router.push(patients.length === 0 ? '/guardian/patients/new' : '/guardian/requests/new')
          }
        />
      ) : (
        requests.map((request) => {
          const patient = patients.find((item) => item.id === request.patientId);
          const isPending = request.status === 'pending';
          const isClosed = request.status === 'completed' || request.status === 'cancelled';
          const isConfirming = confirmingId === request.id;

          return (
            <Card key={request.id}>
              <View style={styles.cardHeader}>
                <AppText variant="subheading">{patient?.name ?? '환자 정보 없음'}</AppText>
                <StatusBadge tone={request.status} />
              </View>

              <AppText variant="body" tone="secondary">
                {CareTypeLabels[request.careType]} · {request.region}
              </AppText>
              <AppText variant="caption" tone="secondary">
                {formatPeriod(request.startDate, request.endDate)}
              </AppText>
              {request.dailyStartTime && request.dailyEndTime ? (
                <AppText variant="caption" tone="secondary">
                  매일 {request.dailyStartTime} ~ {request.dailyEndTime}
                </AppText>
              ) : null}

              {request.matchedAt ? (
                <AppText variant="body" tone="success">
                  간병인이 수락했습니다 · {formatKoreanTimestamp(request.matchedAt)}
                </AppText>
              ) : null}

              <AppText variant="body" numberOfLines={3}>
                {request.requestText}
              </AppText>

              {request.requiredSkills.length > 0 ? (
                <AppText variant="caption" tone="secondary">
                  필요 역량: {request.requiredSkills.join(', ')}
                </AppText>
              ) : null}
              <AppText variant="caption" tone="secondary">
                간병인 성별: {CaregiverGenderPreferenceLabels[request.preferredCaregiverGender]}
                {request.budgetPerDay !== undefined
                  ? ` · 일당 ${request.budgetPerDay.toLocaleString('ko-KR')}원`
                  : ''}
              </AppText>

              {isClosed ? null : isConfirming ? (
                <View style={styles.confirm}>
                  <AppText variant="body" tone="danger">
                    {isPending
                      ? '이 요청을 삭제할까요? 되돌릴 수 없습니다.'
                      : '이 요청을 취소할까요? 배정된 간병인에게도 취소로 표시됩니다.'}
                  </AppText>
                  <View style={styles.actions}>
                    <AppButton
                      title={isPending ? '삭제' : '요청 취소'}
                      variant="danger"
                      style={styles.action}
                      loading={isSubmitting}
                      disabled={isSubmitting}
                      onPress={() => {
                        void (isPending ? remove(request.id) : cancel(request.id)).then(() =>
                          setConfirmingId(null)
                        );
                      }}
                    />
                    <AppButton
                      title="그대로 두기"
                      variant="outline"
                      style={styles.action}
                      disabled={isSubmitting}
                      onPress={() => setConfirmingId(null)}
                    />
                  </View>
                </View>
              ) : (
                <AppButton
                  title={isPending ? '삭제' : '요청 취소'}
                  variant="outline"
                  style={styles.footerButton}
                  onPress={() => setConfirmingId(request.id)}
                />
              )}
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  confirm: {
    gap: Spacing.md,
    paddingTop: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  action: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  footerButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
});
