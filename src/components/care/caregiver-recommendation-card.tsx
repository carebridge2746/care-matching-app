import { StyleSheet, View } from 'react-native';

import { MatchScoreBadge } from '@/components/care/match-score-badge';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { summarizeAvailability } from '@/lib/availability';
import { Colors, Layout, Radius, Spacing } from '@/theme';
import { GenderLabels, type CaregiverRecommendation } from '@/types';

export type CaregiverRecommendationCardProps = {
  recommendation: CaregiverRecommendation;
  /** 점수를 어떻게 냈는지 항목별로 펼쳐 보여 줄지 */
  showBreakdown?: boolean;
};

/**
 * 추천 간병인 한 명.
 *
 * 총점만 보여 주면 왜 이 사람이 위에 있는지 알 수 없다.
 * 항목별 점수를 함께 펼쳐서, 보호자가 납득하고 고를 수 있게 한다 —
 * 사람을 고르는 것은 AI가 아니라 보호자이기 때문이다.
 */
export function CaregiverRecommendationCard({
  recommendation,
  showBreakdown = true,
}: CaregiverRecommendationCardProps) {
  const { caregiver, score } = recommendation;
  const availability = summarizeAvailability(caregiver.availability);

  return (
    <Card>
      <View style={styles.header}>
        <AppText variant="subheading">
          {caregiver.name} · {GenderLabels[caregiver.gender]}
        </AppText>
        <MatchScoreBadge score={score.total} />
      </View>

      <AppText variant="body" tone="secondary">
        경력 {caregiver.yearsOfExperience}년
        {caregiver.certifications.length > 0 ? ` · ${caregiver.certifications.join(', ')}` : ''}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {caregiver.regions.join(', ')}
        {availability ? ` · ${availability}` : ''}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {caregiver.minDailyWage !== undefined
          ? `희망 일당 ${caregiver.minDailyWage.toLocaleString('ko-KR')}원`
          : '희망 일당 협의'}
      </AppText>

      {caregiver.introduction ? (
        <AppText variant="body" numberOfLines={3}>
          {caregiver.introduction}
        </AppText>
      ) : null}

      {showBreakdown ? (
        <View style={styles.breakdown}>
          {score.items.map((item) => (
            <View key={item.label} style={styles.row}>
              <AppText variant="caption" tone="secondary" style={styles.rowLabel}>
                {item.label} {item.score}/{item.max}
              </AppText>
              <AppText variant="caption" tone="tertiary" style={styles.rowDetail}>
                {item.detail}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}
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
  breakdown: {
    marginTop: Spacing.xs,
    padding: Spacing.md,
    gap: Spacing.xs,
    borderRadius: Radius.md,
    borderWidth: Layout.borderWidth,
    borderColor: Colors.surface.divider,
    backgroundColor: Colors.surface.subtle,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  rowLabel: {
    width: 124,
    fontWeight: '600',
  },
  rowDetail: {
    flex: 1,
  },
});
