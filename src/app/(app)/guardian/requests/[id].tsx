import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { CaregiverRecommendationCard } from '@/components/care';
import {
  AppButton,
  AppText,
  Card,
  EmptyState,
  LoadingView,
  Screen,
  StatusBadge,
} from '@/components/common';
import { formatKoreanTimestamp, formatPeriod } from '@/lib/date';
import { MatchWeights, RecommendationThreshold } from '@/lib/matching';
import { useAuthStore } from '@/store/use-auth-store';
import { useCareRequestsStore } from '@/store/use-care-requests-store';
import { usePatientsStore } from '@/store/use-patients-store';
import { useRecommendationsStore } from '@/store/use-recommendations-store';
import { Spacing } from '@/theme';
import { CareTypeLabels, CaregiverGenderPreferenceLabels } from '@/types';

/** 배점을 화면에서 다시 적지 않도록 계산해 둔다 */
const TotalWeight = Object.values(MatchWeights).reduce((sum, weight) => sum + weight, 0);

/**
 * 간병 요청 상세와 추천 간병인.
 *
 * 추천은 정해진 계산의 결과이고, 고르는 것은 보호자다.
 * 그래서 순위만 보여 주지 않고 항목별 점수를 함께 펼쳐 둔다.
 */
export default function GuardianRequestDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);

  const requests = useCareRequestsStore((state) => state.requests);
  const isLoadingRequests = useCareRequestsStore((state) => state.isLoading);
  const loadRequests = useCareRequestsStore((state) => state.load);

  const patients = usePatientsStore((state) => state.patients);
  const loadPatients = usePatientsStore((state) => state.load);

  const recommendations = useRecommendationsStore((state) => state.recommendations);
  const belowThresholdCount = useRecommendationsStore((state) => state.belowThresholdCount);
  const isLoadingRecommendations = useRecommendationsStore((state) => state.isLoading);
  const recommendationsError = useRecommendationsStore((state) => state.errorMessage);
  const loadRecommendations = useRecommendationsStore((state) => state.load);

  const guardianId = user?.id;
  const request = requests.find((item) => item.id === id);

  useFocusEffect(
    useCallback(() => {
      if (guardianId) {
        void loadRequests(guardianId);
        void loadPatients(guardianId);
      }
    }, [guardianId, loadPatients, loadRequests])
  );

  // 요청을 손에 넣은 뒤에야 조건을 알 수 있으므로 추천은 따로 부른다
  useFocusEffect(
    useCallback(() => {
      if (request) {
        void loadRecommendations(request);
      }
      // 요청 자체가 아니라 조건이 바뀔 때만 다시 부른다
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [request?.id, request?.updatedAt, loadRecommendations])
  );

  if (!request) {
    if (isLoadingRequests) {
      return <LoadingView message="요청을 불러오는 중입니다" />;
    }

    return (
      <Screen scroll edges={['bottom']}>
        <EmptyState
          title="요청을 찾지 못했습니다"
          description="이미 삭제된 요청일 수 있습니다."
          actionTitle="목록으로"
          onAction={() => router.replace('/guardian/requests')}
        />
      </Screen>
    );
  }

  const patient = patients.find((item) => item.id === request.patientId);
  const isOpen = request.status === 'pending';

  return (
    <Screen
      scroll
      edges={['bottom']}
      footer={
        <AppButton
          title="요청 목록으로"
          variant="outline"
          onPress={() => router.replace('/guardian/requests')}
        />
      }>
      <View style={styles.header}>
        <AppText variant="title">{patient?.name ?? '환자 정보 없음'}</AppText>
        <StatusBadge tone={request.status} />
      </View>

      {request.matchedAt ? (
        <AppText variant="body" tone="success">
          간병인이 수락했습니다 · {formatKoreanTimestamp(request.matchedAt)}
        </AppText>
      ) : null}

      <Card>
        <AppText variant="heading">요청 내용</AppText>
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
        <AppText variant="body">{request.requestText}</AppText>
        <AppText variant="caption" tone="secondary">
          {request.requiredSkills.length > 0
            ? `필요 역량: ${request.requiredSkills.join(', ')}`
            : '필요 역량 지정 없음'}
        </AppText>
        <AppText variant="caption" tone="secondary">
          간병인 성별: {CaregiverGenderPreferenceLabels[request.preferredCaregiverGender]}
          {request.budgetPerDay !== undefined
            ? ` · 일당 ${request.budgetPerDay.toLocaleString('ko-KR')}원`
            : ' · 일당 협의'}
        </AppText>
      </Card>

      <View style={styles.section}>
        <AppText variant="heading">추천 간병인</AppText>
        <AppText variant="caption" tone="secondary">
          지역·역량·가능 시간·일당·경력·자격을 {TotalWeight}점 만점으로 계산해 점수가 높은 순으로
          보여 드립니다. 사람을 고르는 것은 보호자님입니다.
        </AppText>

        {recommendationsError ? (
          <AppText variant="body" tone="danger">
            {recommendationsError}
          </AppText>
        ) : null}

        {isLoadingRecommendations && recommendations.length === 0 ? (
          <Card>
            <AppText variant="body" tone="secondary">
              조건에 맞는 간병인을 찾는 중입니다…
            </AppText>
          </Card>
        ) : recommendations.length === 0 ? (
          <EmptyState
            title={isOpen ? '아직 추천할 간병인이 없습니다' : '추천 목록이 비어 있습니다'}
            description={
              belowThresholdCount > 0
                ? `조건을 일부 만족하는 간병인이 ${belowThresholdCount}명 있지만 적합도가 ${RecommendationThreshold}점에 못 미칩니다. 지역이나 필요 역량을 넓혀 보세요.`
                : '요청하신 간병 장소와 성별 조건에 맞는 간병인이 아직 등록되지 않았습니다.'
            }
          />
        ) : (
          recommendations.map((recommendation) => (
            <CaregiverRecommendationCard
              key={recommendation.caregiver.id}
              recommendation={recommendation}
            />
          ))
        )}

        {recommendations.length > 0 && belowThresholdCount > 0 ? (
          <AppText variant="caption" tone="tertiary">
            적합도 {RecommendationThreshold}점에 못 미치는 간병인 {belowThresholdCount}명은 목록에서
            제외했습니다.
          </AppText>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  section: {
    gap: Spacing.md,
  },
});
