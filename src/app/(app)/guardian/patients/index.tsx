import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, Card, EmptyState, LoadingView, Screen } from '@/components/common';
import { useAuthStore } from '@/store/use-auth-store';
import { useCareRequestsStore } from '@/store/use-care-requests-store';
import { usePatientsStore } from '@/store/use-patients-store';
import { Spacing } from '@/theme';
import { ageFromBirthYear, CognitionLabels, GenderLabels, MobilityLabels } from '@/types';

/**
 * 환자 목록.
 *
 * 삭제는 되돌릴 수 없고 그 환자의 간병 요청까지 함께 사라지므로,
 * 카드 안에서 한 번 더 확인을 받는다. (Alert는 웹에서 동작하지 않아 화면 안에서 처리한다)
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

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const guardianId = user?.id;

  useEffect(() => {
    if (!guardianId) {
      return;
    }
    void load(guardianId);
    // 삭제할 때 '이 환자의 요청 N건도 함께 지워집니다'를 알려주려면 요청 목록도 있어야 한다
    void loadRequests(guardianId);
  }, [guardianId, load, loadRequests]);

  const handleRemove = async (id: string) => {
    const removed = await remove(id);
    setConfirmingId(null);

    // 환자를 지우면 그 환자의 요청도 함께 사라진다. 목록을 다시 맞춘다.
    if (removed && guardianId) {
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

      {patients.length === 0 ? (
        <EmptyState
          title="등록한 환자가 없습니다"
          description="간병이 필요한 분의 정보를 먼저 등록하면, 그분에 맞는 간병 요청을 올릴 수 있습니다."
          actionTitle="환자 등록"
          onAction={() => router.push('/guardian/patients/new')}
        />
      ) : (
        patients.map((patient) => {
          const requestCount = requests.filter(
            (request) => request.patientId === patient.id
          ).length;
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

              {isConfirming ? (
                <View style={styles.confirm}>
                  <AppText variant="body" tone="danger">
                    {patient.name} 님의 정보를 삭제할까요?
                    {requestCount > 0 ? ` 이 환자로 올린 간병 요청 ${requestCount}건도 함께 지워집니다.` : ''}
                  </AppText>
                  <View style={styles.actions}>
                    <AppButton
                      title="삭제"
                      variant="danger"
                      style={styles.action}
                      loading={isSubmitting}
                      disabled={isSubmitting}
                      onPress={() => {
                        void handleRemove(patient.id);
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
