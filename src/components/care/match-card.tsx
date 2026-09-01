import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { StatusBadge } from '@/components/common/status-badge';
import { formatKoreanTimestamp, formatPeriod } from '@/lib/date';
import { Spacing } from '@/theme';
import {
  ageFromBirthYear,
  CareTypeLabels,
  GenderLabels,
  isMatchLive,
  MatchPartyLabels,
  MatchStatusLabels,
  MatchStatusTones,
  type CareMatch,
  type MatchParty,
} from '@/types';

export type MatchCardProps = {
  match: CareMatch;
  /** 보고 있는 사람이 어느 쪽인지. 상대방과 누를 수 있는 버튼이 이 값으로 갈린다. */
  viewer: MatchParty;
  /** 이 매칭의 상태를 바꾸는 중이면 버튼을 잠근다 */
  busy?: boolean;
  onStart?: () => void;
  onComplete?: () => void;
  onCancel?: () => void;
  /** 값을 주면 카드 전체를 눌러 상세로 갈 수 있다 */
  onPress?: () => void;
};

/**
 * 간병 한 건의 진행 상태.
 *
 * 보호자와 간병인이 같은 카드를 본다. 다른 것은 두 가지뿐이다 —
 * 상대방이 누구인지, 그리고 지금 누를 수 있는 버튼이 무엇인지.
 *
 * 간병 시작은 출근한 간병인만 누른다. 종료는 양쪽 모두 누를 수 있다 —
 * 한쪽만 누를 수 있게 하면 상대가 앱을 열지 않는 동안 간병이 계속 진행중으로 남는다.
 */
export function MatchCard({
  match,
  viewer,
  busy = false,
  onStart,
  onComplete,
  onCancel,
  onPress,
}: MatchCardProps) {
  const { patient, care } = match;
  const counterpart = viewer === 'guardian' ? match.caregiver : match.guardian;
  const counterpartLabel = MatchPartyLabels[viewer === 'guardian' ? 'caregiver' : 'guardian'];

  const isLive = isMatchLive(match.status);
  const canStart = isLive && viewer === 'caregiver' && match.status === 'accepted';
  const canComplete = isLive && match.status === 'inProgress';

  return (
    <Card onPress={onPress}>
      <View style={styles.header}>
        <AppText variant="subheading">
          {patient.name} · {ageFromBirthYear(patient.birthYear)}세 {GenderLabels[patient.gender]}
        </AppText>
        <StatusBadge tone={MatchStatusTones[match.status]} label={MatchStatusLabels[match.status]} />
      </View>

      <AppText variant="body" tone="secondary">
        {CareTypeLabels[care.careType]} · {care.region}
      </AppText>
      <AppText variant="caption" tone="secondary">
        {formatPeriod(care.startDate, care.endDate)}
      </AppText>
      {care.dailyStartTime && care.dailyEndTime ? (
        <AppText variant="caption" tone="secondary">
          매일 {care.dailyStartTime} ~ {care.dailyEndTime}
        </AppText>
      ) : null}

      <AppText variant="label">
        {counterpartLabel} {counterpart.name}
        {counterpart.phone ? ` · ${counterpart.phone}` : ''}
      </AppText>

      {/* 시각은 상태가 옮겨 간 자리마다 남아 있다. 지금 상태에 해당하는 것만 보여 준다. */}
      {match.status === 'inProgress' && match.startedAt ? (
        <AppText variant="caption" tone="secondary">
          {formatKoreanTimestamp(match.startedAt)}부터 간병 중입니다
        </AppText>
      ) : match.status === 'completed' && match.completedAt ? (
        <AppText variant="caption" tone="secondary">
          {formatKoreanTimestamp(match.completedAt)}에 종료되었습니다
        </AppText>
      ) : match.status === 'cancelled' && match.cancelledAt ? (
        <AppText variant="caption" tone="danger">
          {formatKoreanTimestamp(match.cancelledAt)}
          {match.cancelledBy ? ` · ${MatchPartyLabels[match.cancelledBy]}가 취소` : ''}
          {match.cancelReason ? ` · ${match.cancelReason}` : ''}
        </AppText>
      ) : (
        <AppText variant="caption" tone="secondary">
          {formatKoreanTimestamp(match.acceptedAt)}에 매칭되었습니다
        </AppText>
      )}

      {isLive && (canStart || canComplete || onCancel) ? (
        <View style={styles.actions}>
          {canStart && onStart ? (
            <AppButton
              title="간병 시작"
              style={styles.action}
              loading={busy}
              disabled={busy}
              onPress={onStart}
            />
          ) : null}
          {canComplete && onComplete ? (
            <AppButton
              title="간병 종료"
              style={styles.action}
              loading={busy}
              disabled={busy}
              onPress={onComplete}
            />
          ) : null}
          {onCancel ? (
            <AppButton
              title="취소"
              variant="outline"
              style={styles.action}
              disabled={busy}
              onPress={onCancel}
            />
          ) : null}
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
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  action: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
});
