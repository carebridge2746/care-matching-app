import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  CaregiverRecommendationCard,
  MatchCancelForm,
  MatchCard,
  NoShowForm,
} from '@/components/care';
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
import { noShowCountForRequest } from '@/lib/no-show';
import { useAuthStore } from '@/store/use-auth-store';
import { useCareRequestsStore } from '@/store/use-care-requests-store';
import { liveMatchForRequest, useMatchHistoryStore } from '@/store/use-match-history-store';
import { usePatientsStore } from '@/store/use-patients-store';
import { useRecommendationsStore } from '@/store/use-recommendations-store';
import { Spacing } from '@/theme';
import {
  AiCarePlaceLabels,
  AiConfidenceLabels,
  CareTypeLabels,
  CaregiverGenderPreferenceLabels,
  hasAiConditions,
  WeekdayLabels,
  type AiSchedule,
} from '@/types';

/** 배점을 화면에서 다시 적지 않도록 계산해 둔다 */
const TotalWeight = Object.values(MatchWeights).reduce((sum, weight) => sum + weight, 0);

/**
 * AI 가 읽어 낸 일정을 한 줄로 옮긴다.
 * 항목이 하나도 없으면 빈 문자열을 돌려주고, 화면은 그 줄을 아예 그리지 않는다.
 */
function aiScheduleSummary(schedule: AiSchedule): string {
  const parts = [
    schedule.startDate ? formatPeriod(schedule.startDate, schedule.endDate) : null,
    schedule.dailyStartTime && schedule.dailyEndTime
      ? `매일 ${schedule.dailyStartTime} ~ ${schedule.dailyEndTime}`
      : null,
    schedule.weekdays.length > 0
      ? schedule.weekdays.map((weekday) => WeekdayLabels[weekday]).join(', ')
      : null,
    schedule.note,
  ];

  return parts.filter(Boolean).join(' · ');
}

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

  const matches = useMatchHistoryStore((state) => state.matches);
  const updatingMatchId = useMatchHistoryStore((state) => state.updatingId);
  const matchError = useMatchHistoryStore((state) => state.errorMessage);
  const loadMatches = useMatchHistoryStore((state) => state.load);
  const completeMatch = useMatchHistoryStore((state) => state.complete);
  const cancelMatch = useMatchHistoryStore((state) => state.cancel);
  const reportNoShow = useMatchHistoryStore((state) => state.reportNoShow);

  const [isCancellingMatch, setIsCancellingMatch] = useState(false);
  const [isReportingNoShow, setIsReportingNoShow] = useState(false);

  const guardianId = user?.id;
  const request = requests.find((item) => item.id === id);

  useFocusEffect(
    useCallback(() => {
      if (guardianId) {
        void loadRequests(guardianId);
        void loadPatients(guardianId);
        void loadMatches(guardianId, 'guardian');
      }
    }, [guardianId, loadMatches, loadPatients, loadRequests])
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
  // 살아 있는 매칭은 요청당 하나뿐이다. 취소된 이력은 '간병 진행' 화면에서 모아 본다.
  const liveMatch = liveMatchForRequest(matches, request.id);
  const aiSchedule = request.aiConditions ? aiScheduleSummary(request.aiConditions.schedule) : '';
  // 노쇼가 나면 요청은 곧바로 다시 대기중이 된다. 요청 행만 보면 아무 일도 없었던 것처럼
  // 보이므로, 무슨 일이 있었는지는 매칭 이력에서 세어 여기에 적어 준다.
  const noShowCount = noShowCountForRequest(matches, request.id);

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

      {/*
        AI 가 정리한 조건은 폼에서 고른 값을 대신하지 않는다. 매칭에 쓰이는 것은 위 카드의
        조건이고, 이 카드는 "원문을 이렇게 읽었습니다"를 보여 주어 보호자가 빠진 내용을
        알아차리게 하는 자리다. 그래서 나란히 두지 않고 아래에 따로 둔다.
      */}
      {request.aiConditions && hasAiConditions(request.aiConditions) ? (
        <Card>
          <AppText variant="heading">AI가 정리한 요청</AppText>
          <AppText variant="caption" tone="secondary">
            {AiConfidenceLabels[request.aiConditions.confidence]}
            {request.aiAnalyzedAt ? ` · ${formatKoreanTimestamp(request.aiAnalyzedAt)}` : ''}
          </AppText>

          {request.aiConditions.location || request.aiConditions.carePlace !== 'unknown' ? (
            <AppText variant="body">
              {[
                request.aiConditions.location,
                request.aiConditions.carePlace !== 'unknown'
                  ? AiCarePlaceLabels[request.aiConditions.carePlace]
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </AppText>
          ) : null}

          {request.aiConditions.careType.length > 0 ? (
            <AppText variant="body" tone="secondary">
              환자 상태: {request.aiConditions.careType.join(', ')}
            </AppText>
          ) : null}

          {request.aiConditions.requiredSkills.length > 0 ? (
            <AppText variant="body" tone="secondary">
              필요 역량: {request.aiConditions.requiredSkills.join(', ')}
            </AppText>
          ) : null}

          {aiSchedule ? (
            <AppText variant="body" tone="secondary">
              일정: {aiSchedule}
            </AppText>
          ) : null}

          {request.aiConditions.budgetPerDay !== undefined ? (
            <AppText variant="body" tone="secondary">
              일당: {request.aiConditions.budgetPerDay.toLocaleString('ko-KR')}원
            </AppText>
          ) : null}

          {request.aiConditions.additionalNotes ? (
            <AppText variant="body" tone="secondary">
              특이사항: {request.aiConditions.additionalNotes}
            </AppText>
          ) : null}

          <AppText variant="caption" tone="tertiary">
            정리한 내용이 실제와 다르면 위 요청 조건을 기준으로 매칭됩니다.
          </AppText>
        </Card>
      ) : null}

      {liveMatch ? (
        <View style={styles.section}>
          <AppText variant="heading">진행 중인 간병</AppText>
          {matchError ? (
            <AppText variant="body" tone="danger">
              {matchError}
            </AppText>
          ) : null}

          {isCancellingMatch ? (
            <MatchCancelForm
              match={liveMatch}
              viewer="guardian"
              busy={updatingMatchId === liveMatch.id}
              onDismiss={() => setIsCancellingMatch(false)}
              onConfirm={(reason) => {
                if (!guardianId) {
                  return;
                }
                void cancelMatch(liveMatch.id, guardianId, reason).then(() =>
                  setIsCancellingMatch(false)
                );
              }}
            />
          ) : isReportingNoShow ? (
            <NoShowForm
              match={liveMatch}
              busy={updatingMatchId === liveMatch.id}
              onDismiss={() => setIsReportingNoShow(false)}
              onConfirm={(note) => {
                if (!guardianId) {
                  return;
                }
                void reportNoShow(liveMatch.id, guardianId, note).then((reported) => {
                  if (!reported) {
                    return;
                  }
                  setIsReportingNoShow(false);
                  // 신고하면 요청도 다시 대기중이 된다. 이 화면의 요청은 아직 낡았으므로
                  // 다시 읽어야 아래의 추천 간병인 목록이 그 자리에서 열린다.
                  void loadRequests(guardianId);
                });
              }}
            />
          ) : (
            <MatchCard
              match={liveMatch}
              viewer="guardian"
              busy={updatingMatchId === liveMatch.id}
              onComplete={() => {
                if (guardianId) {
                  void completeMatch(liveMatch.id, guardianId);
                }
              }}
              onCancel={() => setIsCancellingMatch(true)}
              onReportNoShow={() => setIsReportingNoShow(true)}
            />
          )}
        </View>
      ) : request.matchedAt ? (
        <AppText variant="body" tone="secondary">
          간병인이 수락했던 요청입니다 · {formatKoreanTimestamp(request.matchedAt)}
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

      {/*
        간병인이 이미 붙은 요청에는 추천을 띄우지 않는다. 고를 일이 남아 있지 않고,
        진행 중인 간병 옆에 다른 사람 목록이 놓이면 사람을 갈아 치우는 화면으로 읽힌다.
        매칭이 취소되면 요청은 다시 대기중이 되고 이 목록도 함께 돌아온다.
      */}
      {isOpen ? (
        <View style={styles.section}>
          <AppText variant="heading">{noShowCount > 0 ? '대체 간병인' : '추천 간병인'}</AppText>
          {noShowCount > 0 ? (
            <AppText variant="caption" tone="danger">
              이 요청에서 간병인 {noShowCount}명이 오지 않았습니다. 그분들은 이 요청을 다시 맡을 수
              없고 아래 목록에도 나오지 않습니다.
            </AppText>
          ) : null}
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
              title="아직 추천할 간병인이 없습니다"
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
              적합도 {RecommendationThreshold}점에 못 미치는 간병인 {belowThresholdCount}명은
              목록에서 제외했습니다.
            </AppText>
          ) : null}
        </View>
      ) : null}
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
