import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/app-text';
import { GoodMatchThreshold } from '@/lib/matching';
import { Colors, Radius, Spacing } from '@/theme';

export type MatchScoreBadgeProps = {
  /** 0~100 */
  score: number;
};

/**
 * 적합도 점수 배지.
 *
 * 색으로만 구분하지 않고 '87점'을 그대로 적는다.
 * 점수는 어림값이 아니라 정해진 계산의 결과이므로 숫자를 감출 이유가 없다.
 */
export function MatchScoreBadge({ score }: MatchScoreBadgeProps) {
  const isGood = score >= GoodMatchThreshold;

  return (
    <View style={[styles.badge, isGood ? styles.good : styles.fair]}>
      <AppText variant="label" style={[styles.label, isGood ? styles.goodText : styles.fairText]}>
        적합도 {score}점
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
  },
  good: {
    backgroundColor: Colors.brand.accentSoft,
  },
  fair: {
    backgroundColor: Colors.surface.subtle,
  },
  label: {
    fontWeight: '700',
  },
  goodText: {
    color: Colors.feedback.success,
  },
  fairText: {
    color: Colors.text.secondary,
  },
});
