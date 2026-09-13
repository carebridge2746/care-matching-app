import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { StatusBadge } from '@/components/common/status-badge';
import {
  assessArrival,
  isStoppedByCaregiver,
  scheduledStartAt,
  SharingWindowHours,
} from '@/lib/arrival';
import { formatClockTime } from '@/lib/date';
import { Spacing, type StatusTone } from '@/theme';
import {
  ArrivalAssessmentLabels,
  LocationSharingStatusLabels,
  type ArrivalAssessment,
  type CareMatch,
  type LocationSharing,
} from '@/types';

export const ArrivalAssessmentTones: Record<ArrivalAssessment, StatusTone> = {
  onTime: 'cancelled',
  preparing: 'matched',
  moving: 'inProgress',
  delayed: 'pending',
  needsConfirmation: 'noShow',
  arrived: 'completed',
  cancelled: 'cancelled',
};

export type GuardianArrivalStatusProps = {
  match: CareMatch;
  sharing?: LocationSharing;
  /** 테스트에서 시각을 고정할 때만 넘긴다 */
  now?: Date;
};

/** 가장 먼저 읽힐 한 문장. 좌표가 아니라 지금 무슨 일이 있는지를 말한다. */
function headlineOf(sharing: LocationSharing): string {
  if (isStoppedByCaregiver(sharing)) {
    return '돌봄제공자가 위치 공유를 중지했습니다';
  }
  if (sharing.status === 'unavailable') {
    return '위치를 확인할 수 없습니다';
  }
  if (sharing.status === 'ended') {
    return sharing.arrivedAt ? '도착 완료 · 위치 공유가 끝났습니다' : '위치 공유가 끝났습니다';
  }
  return LocationSharingStatusLabels[sharing.status];
}

/** 판단에 따라 보호자가 할 수 있는 일. 노쇼를 대신 정하지 않는다. */
function guidanceOf(assessment: ArrivalAssessment, sharing: LocationSharing): string | null {
  // 멈춘 공유에 "이동을 시작하면"이라고 안내하면 앞 문장과 어긋난다 — 시작 전에는 기다리면 된다고만 말한다
  if (assessment === 'preparing' && isStoppedByCaregiver(sharing)) {
    return '간병인이 공유를 다시 켜면 이동 상태가 여기에 표시됩니다. 걱정되면 간병인께 연락해 주세요.';
  }
  switch (assessment) {
    case 'delayed':
      return '도착이 시작 시각보다 늦어질 수 있습니다. 필요하면 간병인께 연락해 주세요.';
    case 'needsConfirmation':
      return '시작 시각이 지났지만 도착이 확인되지 않았습니다. 간병인께 연락해 확인해 주세요. 위치 정보만으로 노쇼로 처리되지 않으며, 오지 않았다면 직접 신고할 수 있습니다.';
    case 'preparing':
      return '간병인이 이동을 시작하면 여기에 표시됩니다.';
    case 'onTime':
      return `간병 시작 ${SharingWindowHours}시간 전부터 이동 상태가 표시됩니다.`;
    default:
      return null;
  }
}

/**
 * 안심 도착 — 보호자 쪽 (Phase 13).
 *
 * 지도나 좌표를 보여 주지 않는다. 보호자에게 필요한 것은 "제시간에 오고 있는가"이고,
 * 상대의 움직임을 계속 들여다보는 화면이 되면 간병인이 감시받는다고 느낀다.
 * 그래서 상태 한 줄, 예상 도착, 마지막 업데이트, 그리고 할 수 있는 일만 둔다.
 */
export function GuardianArrivalStatus({ match, sharing, now = new Date() }: GuardianArrivalStatusProps) {
  if (!sharing || (match.status !== 'accepted' && match.status !== 'inProgress')) {
    return null;
  }

  const assessment = assessArrival(match, sharing, now);
  const guidance = guidanceOf(assessment, sharing);
  const startsAt = scheduledStartAt(match.care);

  return (
    <Card>
      <View style={styles.header}>
        <AppText variant="subheading">안심 도착</AppText>
        <StatusBadge tone={ArrivalAssessmentTones[assessment]} label={ArrivalAssessmentLabels[assessment]} />
      </View>

      <AppText variant="body" tone={isStoppedByCaregiver(sharing) || sharing.status === 'unavailable' ? 'danger' : 'primary'}>
        {headlineOf(sharing)}
      </AppText>

      <AppText variant="caption" tone="secondary">
        {[
          `간병 시작 ${formatClockTime(startsAt.toISOString())}`,
          sharing.estimatedArrivalAt ? `예상 도착 ${formatClockTime(sharing.estimatedArrivalAt)}` : null,
          sharing.arrivedAt ? `도착 ${formatClockTime(sharing.arrivedAt)}` : null,
          sharing.lastUpdatedAt ? `마지막 업데이트 ${formatClockTime(sharing.lastUpdatedAt)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </AppText>

      {guidance ? (
        <AppText variant="caption" tone={assessment === 'needsConfirmation' ? 'danger' : 'secondary'}>
          {guidance}
        </AppText>
      ) : null}

      <AppText variant="caption" tone="tertiary">
        정확한 위치가 아니라 이동 상태와 예상 도착 시각만 보입니다.
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
