import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/app-text';
import { Radius, Spacing, StatusColors, type StatusTone } from '@/theme';

/** 상태를 색상만으로 구분하지 않도록 기본 라벨을 함께 정의한다 */
const StatusLabels: Record<StatusTone, string> = {
  pending: '대기중',
  matched: '매칭 완료',
  inProgress: '간병 진행중',
  completed: '종료',
  cancelled: '취소',
  noShow: '노쇼',
};

export type StatusBadgeProps = {
  tone: StatusTone;
  /** 기본 라벨 대신 다른 문구를 쓸 때 */
  label?: string;
};

export function StatusBadge({ tone, label }: StatusBadgeProps) {
  const { fg, bg } = StatusColors[tone];

  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <AppText variant="caption" style={[styles.label, { color: fg }]}>
        {label ?? StatusLabels[tone]}
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
  label: {
    fontWeight: '700',
  },
});
