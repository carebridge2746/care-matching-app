import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, Card, Screen, StatusBadge } from '@/components/common';
import { formatPeriod } from '@/lib/date';
import { useAuthStore } from '@/store/use-auth-store';
import { useCareRequestsStore } from '@/store/use-care-requests-store';
import { usePatientsStore } from '@/store/use-patients-store';
import { Spacing } from '@/theme';
import { CareTypeLabels } from '@/types';

/**
 * 보호자 홈.
 *
 * 등록한 환자와 올린 요청이 지금 어떤 상태인지 먼저 보여주고,
 * 다음에 할 일(요청 작성)로 바로 갈 수 있게 한다.
 */
export default function GuardianHomeScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);

  const patients = usePatientsStore((state) => state.patients);
  const loadPatients = usePatientsStore((state) => state.load);
  const requests = useCareRequestsStore((state) => state.requests);
  const loadRequests = useCareRequestsStore((state) => state.load);

  const guardianId = user?.id;

  // 화면에 돌아올 때마다 다시 불러온다. 간병인이 요청을 수락하면 상태가 바뀌기 때문이다.
  useFocusEffect(
    useCallback(() => {
      if (!guardianId) {
        return;
      }
      void loadPatients(guardianId);
      void loadRequests(guardianId);
    }, [guardianId, loadPatients, loadRequests])
  );

  if (!user) {
    return null;
  }

  const pendingCount = requests.filter((request) => request.status === 'pending').length;
  const matchedCount = requests.filter((request) => request.matchedCaregiverId).length;
  const recentRequests = requests.slice(0, 2);
  const hasPatients = patients.length > 0;

  return (
    <Screen
      scroll
      edges={['bottom']}
      footer={
        <>
          <AppButton
            title={hasPatients ? '간병 요청 작성' : '환자 먼저 등록하기'}
            onPress={() =>
              router.push(hasPatients ? '/guardian/requests/new' : '/guardian/patients/new')
            }
          />
          <AppButton
            title="로그아웃"
            variant="outline"
            onPress={() => {
              void signOut();
            }}
          />
        </>
      }>
      <View style={styles.greeting}>
        <AppText variant="title">{user.name} 님, 안녕하세요</AppText>
        <AppText variant="body" tone="secondary">
          {hasPatients
            ? '필요한 간병을 평소 말하듯 적으면 AI가 조건을 정리해 드립니다.'
            : '먼저 간병이 필요한 분의 정보를 등록해 주세요.'}
        </AppText>
      </View>

      <Card onPress={() => router.push('/guardian/patients')}>
        <AppText variant="subheading">환자 관리</AppText>
        <AppText variant="body" tone="secondary">
          {hasPatients ? `${patients.length}명 등록됨` : '아직 등록한 환자가 없습니다'}
        </AppText>
      </Card>

      <Card onPress={() => router.push('/guardian/requests')}>
        <AppText variant="subheading">간병 요청</AppText>
        <AppText variant="body" tone="secondary">
          {requests.length > 0
            ? `${requests.length}건 · 대기중 ${pendingCount}건 · 매칭 완료 ${matchedCount}건`
            : '아직 올린 요청이 없습니다'}
        </AppText>
      </Card>

      {recentRequests.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="heading">최근 요청</AppText>
          {recentRequests.map((request) => {
            const patient = patients.find((item) => item.id === request.patientId);

            return (
              <Card
                key={request.id}
                onPress={() => router.push(`/guardian/requests/${request.id}`)}>
                <View style={styles.cardHeader}>
                  <AppText variant="subheading">{patient?.name ?? '환자 정보 없음'}</AppText>
                  <StatusBadge tone={request.status} />
                </View>
                <AppText variant="caption" tone="secondary">
                  {CareTypeLabels[request.careType]} · {request.region}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {formatPeriod(request.startDate, request.endDate)}
                </AppText>
              </Card>
            );
          })}
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
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
});
