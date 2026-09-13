import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MatchScoreBadge } from '@/components/care';
import { AppButton, AppText, Card, EmptyState, LoadingView, Screen, StatusBadge } from '@/components/common';
import { formatPeriod } from '@/lib/date';
import { scoreMatch } from '@/lib/matching';
import { useAuthStore } from '@/store/use-auth-store';
import { useCaregiverProfileStore } from '@/store/use-caregiver-profile-store';
import { useCaregiverRequestsStore } from '@/store/use-caregiver-requests-store';
import { Spacing } from '@/theme';
import {
  ageFromBirthYear,
  CareTypeLabels,
  CaregiverGenderPreferenceLabels,
  CognitionLabels,
  GenderLabels,
  MobilityLabels,
} from '@/types';

/** 항목 하나 — 왼쪽에 이름, 오른쪽에 값 */
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText variant="label" tone="secondary" style={styles.rowLabel}>
        {label}
      </AppText>
      <AppText variant="body" style={styles.rowValue}>
        {value}
      </AppText>
    </View>
  );
}

/**
 * 간병 요청 상세 — 수락 여부를 정하는 화면.
 *
 * 수락하기 전에는 환자 이름이 성만 보인다(김OO). 나머지 정보는 요청을 받을 수 있는지
 * 판단하는 데 필요하므로 그대로 보여 주고, 이름은 매칭이 확정된 뒤에 열린다.
 * 가리는 일은 화면이 아니라 데이터가 나오는 지점(어댑터/데이터베이스 뷰)에서 한다.
 */
export default function CareRequestDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);

  const available = useCaregiverRequestsStore((state) => state.available);
  const accepted = useCaregiverRequestsStore((state) => state.accepted);
  const isLoading = useCaregiverRequestsStore((state) => state.isLoading);
  const acceptingId = useCaregiverRequestsStore((state) => state.acceptingId);
  const errorMessage = useCaregiverRequestsStore((state) => state.errorMessage);
  const loadedCaregiverId = useCaregiverRequestsStore((state) => state.loadedCaregiverId);
  const load = useCaregiverRequestsStore((state) => state.load);
  const accept = useCaregiverRequestsStore((state) => state.accept);

  const profile = useCaregiverProfileStore((state) => state.profile);
  const loadProfile = useCaregiverProfileStore((state) => state.load);

  const [isConfirming, setIsConfirming] = useState(false);
  const caregiverId = user?.id;

  // 주소를 직접 열고 들어온 경우에는 목록이 비어 있다. 그때만 불러온다.
  useFocusEffect(
    useCallback(() => {
      if (!caregiverId) {
        return;
      }
      if (loadedCaregiverId !== caregiverId) {
        void load(caregiverId);
      }
      // 적합도를 보여 주려면 내 프로필이 있어야 한다
      void loadProfile(caregiverId);
    }, [caregiverId, load, loadProfile, loadedCaregiverId])
  );

  const request =
    accepted.find((item) => item.id === id) ?? available.find((item) => item.id === id);

  if (!request) {
    if (isLoading) {
      return <LoadingView message="요청을 불러오는 중입니다" />;
    }

    return (
      <Screen scroll edges={['bottom']}>
        <EmptyState
          title="요청을 찾지 못했습니다"
          description="다른 간병인이 먼저 수락했거나 보호자가 요청을 거두었을 수 있습니다."
          actionTitle="목록으로"
          onAction={() => router.replace('/caregiver/requests')}
        />
      </Screen>
    );
  }

  const { patient } = request;
  const isMine = request.matchedCaregiverId === caregiverId;
  const isOpen = request.status === 'pending';
  const isAccepting = acceptingId === request.id;

  // 프로필이 없으면 점수를 매길 수 없다. 그때는 수락을 막지 않는다.
  const match = profile ? scoreMatch(profile, request) : null;
  const canAccept = isOpen && match?.isEligible !== false;

  const handleAccept = async () => {
    if (!caregiverId) {
      return;
    }

    const succeeded = await accept(request.id, caregiverId);
    setIsConfirming(false);

    if (succeeded) {
      // 수락한 요청은 '수락한 간병'으로 옮겨 간다. 뒤로 눌러 다시 이 화면에 오지 않도록 바꿔 준다.
      router.replace('/caregiver/accepted');
    }
  };

  return (
    <Screen
      scroll
      edges={['bottom']}
      footer={
        canAccept ? (
          isConfirming ? (
            <View style={styles.actions}>
              <AppButton
                title="네, 수락합니다"
                style={styles.action}
                loading={isAccepting}
                disabled={isAccepting}
                onPress={() => {
                  void handleAccept();
                }}
              />
              <AppButton
                title="다시 보기"
                variant="outline"
                style={styles.action}
                disabled={isAccepting}
                onPress={() => setIsConfirming(false)}
              />
            </View>
          ) : (
            <AppButton title="매칭 수락하기" onPress={() => setIsConfirming(true)} />
          )
        ) : (
          <AppButton
            title="목록으로"
            variant="outline"
            onPress={() => router.replace('/caregiver/requests')}
          />
        )
      }>
      <View style={styles.header}>
        <AppText variant="title">
          {patient.name} · {ageFromBirthYear(patient.birthYear)}세{' '}
          {GenderLabels[patient.gender]}
        </AppText>
        <StatusBadge tone={request.status} />
      </View>

      {isMine ? (
        <AppText variant="body" tone="success">
          이 요청을 수락하셨습니다. 보호자에게 매칭 완료로 표시됩니다.
        </AppText>
      ) : !isOpen ? (
        <AppText variant="body" tone="danger">
          지금은 수락할 수 없는 요청입니다.
        </AppText>
      ) : match && !match.isEligible ? (
        <AppText variant="body" tone="danger">
          이 요청은 수락할 수 없습니다 — {match.excludedReason}
        </AppText>
      ) : (
        <AppText variant="body" tone="secondary">
          환자 성함은 매칭이 확정된 뒤에 공개됩니다.
        </AppText>
      )}

      {match?.isEligible ? (
        <Card>
          <View style={styles.matchHeader}>
            <AppText variant="heading">나와의 적합도</AppText>
            <MatchScoreBadge score={match.total} />
          </View>
          {match.items.map((item) => (
            <View key={item.label} style={styles.row}>
              <AppText variant="label" tone="secondary" style={styles.rowLabel}>
                {item.label} {item.score}/{item.max}
              </AppText>
              <AppText variant="caption" tone="tertiary" style={styles.rowValue}>
                {item.detail}
              </AppText>
            </View>
          ))}
        </Card>
      ) : null}

      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}

      <Card>
        <AppText variant="heading">보호자가 적은 요청</AppText>
        {/* 원문에는 이름·병원·연락처가 섞일 수 있어 수락한 간병인에게만 내려온다 */}
        {request.requestText ? (
          <AppText variant="body">{request.requestText}</AppText>
        ) : (
          <AppText variant="body" tone="secondary">
            보호자가 적은 원문은 수락한 뒤에 보입니다. 아래 간병 조건과 환자 상태로 판단해 주세요.
          </AppText>
        )}
      </Card>

      <Card>
        <AppText variant="heading">간병 조건</AppText>
        <DetailRow label="장소" value={CareTypeLabels[request.careType]} />
        <DetailRow label="지역" value={request.region} />
        <DetailRow label="기간" value={formatPeriod(request.startDate, request.endDate)} />
        <DetailRow
          label="시간대"
          value={
            request.dailyStartTime && request.dailyEndTime
              ? `매일 ${request.dailyStartTime} ~ ${request.dailyEndTime}`
              : '협의'
          }
        />
        <DetailRow
          label="일당"
          value={
            request.budgetPerDay !== undefined
              ? `${request.budgetPerDay.toLocaleString('ko-KR')}원`
              : '협의'
          }
        />
        <DetailRow
          label="간병인 성별"
          value={CaregiverGenderPreferenceLabels[request.preferredCaregiverGender]}
        />
        <DetailRow
          label="필요 역량"
          value={request.requiredSkills.length > 0 ? request.requiredSkills.join(', ') : '지정 없음'}
        />
      </Card>

      <Card>
        <AppText variant="heading">환자 상태</AppText>
        <DetailRow label="거동" value={MobilityLabels[patient.mobility]} />
        <DetailRow label="인지" value={CognitionLabels[patient.cognition]} />
        <DetailRow
          label="질환"
          value={patient.conditions.length > 0 ? patient.conditions.join(', ') : '등록된 질환 없음'}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  rowLabel: {
    width: 124,
  },
  rowValue: {
    flex: 1,
  },
  matchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  action: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
});
