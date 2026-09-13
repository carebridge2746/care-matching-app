import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, Card, EmptyState, LoadingView, Screen } from '@/components/common';
import { useAuthStore } from '@/store/use-auth-store';
import { useCareRequestsStore } from '@/store/use-care-requests-store';
import { useMatchHistoryStore } from '@/store/use-match-history-store';
import { usePatientsStore } from '@/store/use-patients-store';
import { Spacing } from '@/theme';
import { ageFromBirthYear, CognitionLabels, GenderLabels, isMatchLive, MobilityLabels } from '@/types';

/**
 * 환자 목록.
 *
 * 삭제는 되돌릴 수 없으므로 카드 안에서 한 번 더 확인을 받는다.
 * (Alert는 웹에서 동작하지 않아 화면 안에서 처리한다)
 *
 * 무엇이 지워지는지는 간병 기록에 따라 다르고, 누르기 전에 그대로 알려 준다.
 *   - 기록이 없으면 환자와 요청이 모두 지워진다.
 *   - 기록이 있으면 기록은 남기고 이름·질환·특이사항만 지운다 — 간병인이 받은 후기와
 *     노쇼 기록이 환자 한 명을 지우는 것으로 사라지면 안 되기 때문이다.
 *   - 진행 중인 간병이 있으면 지울 수 없다.
 * 같은 판정을 저장소도 한다. 화면은 안내와 버튼만 고른다.
 */
export default function PatientListScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const patients = usePatientsStore((state) => state.patients);
  const isLoading = usePatientsStore((state) => state.isLoading);
  const isSubmitting = usePatientsStore((state) => state.isSubmitting);
  const errorMessage = usePatientsStore((state) => state.errorMessage);
  const load = usePatientsStore((state) => state.load);
  const remove = usePatientsStore((state) => state.remove);

  const requests = useCareRequestsStore((state) => state.requests);
  const loadRequests = useCareRequestsStore((state) => state.load);

  const matches = useMatchHistoryStore((state) => state.matches);
  const loadMatches = useMatchHistoryStore((state) => state.load);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  /** 방금 한 삭제가 어떻게 처리됐는지. 익명화했을 때 기록은 남았다는 것을 알려 준다. */
  const [notice, setNotice] = useState<string | null>(null);
  const guardianId = user?.id;

  useEffect(() => {
    if (!guardianId) {
      return;
    }
    void load(guardianId);
    // 삭제할 때 무엇이 함께 지워지는지 알려주려면 요청과 매칭 기록도 있어야 한다
    void loadRequests(guardianId);
    void loadMatches(guardianId, 'guardian');
  }, [guardianId, load, loadMatches, loadRequests]);

  const handleRemove = async (id: string, name: string) => {
    setNotice(null);
    const removal = await remove(id);
    setConfirmingId(null);

    if (removal === 'anonymized') {
      setNotice(`${name} 님의 이름과 건강 정보를 지웠습니다. 간병 기록은 남겨 두었습니다.`);
    }
    // 환자를 지우면 요청도 함께 정리된다. 목록을 다시 맞춘다.
    if (removal && guardianId) {
      void loadRequests(guardianId);
    }
  };

  if (isLoading && patients.length === 0) {
    return <LoadingView message="환자 목록을 불러오는 중입니다" />;
  }

  return (
    <Screen
      scroll
      edges={['bottom']}
      footer={<AppButton title="환자 등록" onPress={() => router.push('/guardian/patients/new')} />}>
      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}

      {notice ? (
        <AppText variant="body" tone="secondary">
          {notice}
        </AppText>
      ) : null}

      {patients.length === 0 ? (
        <EmptyState
          title="등록한 환자가 없습니다"
          description="간병이 필요한 분의 정보를 먼저 등록하면, 그분에 맞는 간병 요청을 올릴 수 있습니다."
          actionTitle="환자 등록"
          onAction={() => router.push('/guardian/patients/new')}
        />
      ) : (
        patients.map((patient) => {
          const patientRequests = requests.filter((request) => request.patientId === patient.id);
          const patientMatches = matches.filter((match) =>
            patientRequests.some((request) => request.id === match.requestId)
          );
          const hasLiveCare = patientMatches.some((match) => isMatchLive(match.status));
          const requestsWithoutHistory = patientRequests.filter(
            (request) => !patientMatches.some((match) => match.requestId === request.id)
          ).length;
          const hasHistory = patientMatches.length > 0;
          const isConfirming = confirmingId === patient.id;

          return (
            <Card key={patient.id}>
              <View style={styles.cardHeader}>
                <AppText variant="subheading">
                  {patient.name}
                  {patient.relationship ? ` (${patient.relationship})` : ''}
                </AppText>
                <AppText variant="caption" tone="secondary">
                  {ageFromBirthYear(patient.birthYear)}세 · {GenderLabels[patient.gender]}
                </AppText>
              </View>

              <AppText variant="body" tone="secondary">
                {MobilityLabels[patient.mobility]}
              </AppText>
              <AppText variant="caption" tone="secondary">
                인지 상태: {CognitionLabels[patient.cognition]}
              </AppText>

              {patient.conditions.length > 0 ? (
                <AppText variant="caption" tone="secondary">
                  질환: {patient.conditions.join(', ')}
                </AppText>
              ) : null}

              {patient.careNotes ? (
                <AppText variant="caption" tone="secondary">
                  특이사항: {patient.careNotes}
                </AppText>
              ) : null}

              {hasLiveCare ? (
                <AppText variant="caption" tone="tertiary">
                  진행 중인 간병이 있어 지금은 지울 수 없습니다. 간병을 마치거나 취소한 뒤에 지울 수
                  있습니다.
                </AppText>
              ) : isConfirming ? (
                <View style={styles.confirm}>
                  <AppText variant="body" tone="danger">
                    {patient.name} 님의 정보를 삭제할까요?
                    {hasHistory
                      ? ' 간병 기록이 남아 있어 기록은 지우지 않고, 이름·질환·특이사항만 지웁니다.'
                      : ''}
                    {requestsWithoutHistory > 0
                      ? ` 이 환자로 올린 간병 요청 ${requestsWithoutHistory}건도 함께 지워집니다.`
                      : ''}
                  </AppText>
                  <View style={styles.actions}>
                    <AppButton
                      title="삭제"
                      variant="danger"
                      style={styles.action}
                      loading={isSubmitting}
                      disabled={isSubmitting}
                      onPress={() => {
                        void handleRemove(patient.id, patient.name);
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
                  title="삭제"
                  variant="outline"
                  style={styles.removeButton}
                  onPress={() => setConfirmingId(patient.id)}
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
    alignItems: 'baseline',
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
  removeButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
});
