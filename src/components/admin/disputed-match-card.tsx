import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { StatusBadge } from '@/components/common/status-badge';
import { formatKoreanTimestamp, formatPeriod } from '@/lib/date';
import { Spacing, type StatusTone } from '@/theme';
import {
  DisputedMatchKindDescriptions,
  DisputedMatchKindLabels,
  MatchStatusLabels,
  type DisputedMatch,
  type DisputedMatchKind,
} from '@/types';

const KindTones: Record<DisputedMatchKind, StatusTone> = {
  noShow: 'noShow',
  overdue: 'pending',
};

export type DisputedMatchCardProps = {
  match: DisputedMatch;
  busy?: boolean;
  /** 노쇼로 신고된 건에만 쓴다 */
  onClearNoShow?: () => void;
  /** 끝날 날이 지났는데 살아 있는 건에만 쓴다 */
  onCancel?: () => void;
};

/**
 * 관리자가 손대야 하는 매칭 한 건.
 *
 * 환자 정보와 연락처는 없다. 관리자가 판단하는 데 필요한 것은
 * "누구와 누구의 언제 간병인가"까지다.
 *
 * 종류마다 버튼이 하나뿐이다. 노쇼 건을 강제 종료할 일은 없고(이미 끝난 매칭이다),
 * 방치된 건의 노쇼를 되돌릴 일도 없다.
 */
export function DisputedMatchCard({
  match,
  busy = false,
  onClearNoShow,
  onCancel,
}: DisputedMatchCardProps) {
  return (
    <Card>
      <View style={styles.header}>
        <AppText variant="subheading">
          보호자 {match.guardianName} · 간병인 {match.caregiverName}
        </AppText>
        <StatusBadge tone={KindTones[match.kind]} label={DisputedMatchKindLabels[match.kind]} />
      </View>

      <AppText variant="body" tone="secondary">
        {match.region} · {formatPeriod(match.startDate, match.endDate)}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {formatKoreanTimestamp(match.acceptedAt)}에 매칭 · 지금 상태 {MatchStatusLabels[match.status]}
        {match.startedAt ? ` · ${formatKoreanTimestamp(match.startedAt)}에 시작` : ''}
      </AppText>

      {match.kind === 'noShow' && match.noShowAt ? (
        <AppText variant="caption" tone="danger">
          {formatKoreanTimestamp(match.noShowAt)}에 신고됨
          {match.noShowNote ? ` · ${match.noShowNote}` : ''}
        </AppText>
      ) : null}

      <AppText variant="caption" tone="tertiary">
        {DisputedMatchKindDescriptions[match.kind]}
      </AppText>

      {match.kind === 'noShow' && onClearNoShow ? (
        <AppButton
          title="노쇼 신고 취소"
          variant="outline"
          loading={busy}
          disabled={busy}
          onPress={onClearNoShow}
        />
      ) : null}
      {match.kind === 'overdue' && onCancel ? (
        <AppButton
          title="매칭 강제 종료"
          variant="danger"
          loading={busy}
          disabled={busy}
          onPress={onCancel}
        />
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
});
