import { StyleSheet, View } from 'react-native';

import { ArrivalAssessmentTones } from '@/components/arrival/guardian-arrival-status';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { StatusBadge } from '@/components/common/status-badge';
import { isStoppedByCaregiver, scheduledStartAt } from '@/lib/arrival';
import { formatClockTime, formatKoreanDate } from '@/lib/date';
import { Spacing } from '@/theme';
import { ArrivalAssessmentLabels, LocationSharingStatusLabels, type ArrivalWatchItem } from '@/types';

export type ArrivalWatchCardProps = {
  item: ArrivalWatchItem;
};

/**
 * 관리자 도착 확인 한 줄 (Phase 13).
 *
 * 볼 수만 있고 버튼이 없다. '확인 필요'는 판단을 돕는 안내일 뿐이라 여기서 노쇼나 제재를
 * 정하지 않는다 — 노쇼는 보호자 신고, 되돌리기는 기존 관리자 조치로만 다룬다.
 */
export function ArrivalWatchCard({ item }: ArrivalWatchCardProps) {
  const { sharing } = item;
  const startsAt = scheduledStartAt({ startDate: item.startDate, dailyStartTime: item.dailyStartTime });

  return (
    <Card>
      <View style={styles.header}>
        <AppText variant="subheading">
          보호자 {item.guardianName} · 간병인 {item.caregiverName}
        </AppText>
        <StatusBadge
          tone={ArrivalAssessmentTones[item.assessment]}
          label={ArrivalAssessmentLabels[item.assessment]}
        />
      </View>

      <AppText variant="body" tone="secondary">
        {item.region} · {formatKoreanDate(item.startDate)} {formatClockTime(startsAt.toISOString())} 시작
      </AppText>

      <AppText variant="caption" tone="secondary">
        {[
          LocationSharingStatusLabels[sharing.status],
          sharing.startedAt ? `이동 시작 ${formatClockTime(sharing.startedAt)}` : '이동 시작 전',
          sharing.arrivedAt ? `도착 ${formatClockTime(sharing.arrivedAt)}` : '도착 미확인',
          sharing.lastUpdatedAt ? `마지막 업데이트 ${formatClockTime(sharing.lastUpdatedAt)}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </AppText>

      {isStoppedByCaregiver(sharing) ? (
        <AppText variant="caption" tone="danger">
          간병인이 위치 공유를 중지했습니다
        </AppText>
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
