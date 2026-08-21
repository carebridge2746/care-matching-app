import { StyleSheet, View } from 'react-native';

import { MatchScoreBadge } from '@/components/care/match-score-badge';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { StatusBadge } from '@/components/common/status-badge';
import { formatPeriod } from '@/lib/date';
import { Spacing } from '@/theme';
import {
  ageFromBirthYear,
  CareTypeLabels,
  GenderLabels,
  type CaregiverCareRequest,
} from '@/types';

export type CaregiverRequestCardProps = {
  request: CaregiverCareRequest;
  /** 값을 주면 카드 전체를 눌러 상세로 갈 수 있다 */
  onPress?: () => void;
  /** 내 프로필과 맞춰 본 적합도(0~100). 프로필을 등록하지 않았으면 없음 */
  matchScore?: number;
};

/**
 * 간병인 화면의 요청 한 건.
 *
 * 목록에서 스크롤하며 훑는 카드이므로, 수락 여부를 가르는 값
 * (누구를 · 어디서 · 언제 · 얼마에)을 먼저 보여 주고 원문은 두 줄만 미리 보여 준다.
 */
export function CaregiverRequestCard({
  request,
  onPress,
  matchScore,
}: CaregiverRequestCardProps) {
  const { patient } = request;

  return (
    <Card onPress={onPress}>
      <View style={styles.header}>
        <AppText variant="subheading">
          {patient.name} · {ageFromBirthYear(patient.birthYear)}세 {GenderLabels[patient.gender]}
        </AppText>
        <StatusBadge tone={request.status} />
      </View>

      {matchScore !== undefined ? <MatchScoreBadge score={matchScore} /> : null}

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

      <AppText variant="body" numberOfLines={2}>
        {request.requestText}
      </AppText>

      <AppText variant="label" tone="brand">
        {request.budgetPerDay !== undefined
          ? `일당 ${request.budgetPerDay.toLocaleString('ko-KR')}원`
          : '일당 협의'}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
});
