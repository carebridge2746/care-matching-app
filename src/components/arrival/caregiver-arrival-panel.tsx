import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { StatusBadge } from '@/components/common/status-badge';
import {
  isWithinSharingWindow,
  scheduledStartAt,
  SharingWindowHours,
} from '@/lib/arrival';
import { formatClockTime, formatKoreanDate } from '@/lib/date';
import { Spacing, type StatusTone } from '@/theme';
import {
  LocationSharingStatusLabels,
  type CareMatch,
  type LocationSharing,
  type LocationSharingStatus,
} from '@/types';

export type ArrivalAction =
  | 'giveConsent'
  | 'start'
  | 'markNearby'
  | 'markArrived'
  | 'pause'
  | 'resume'
  | 'stop';

export type CaregiverArrivalPanelProps = {
  match: CareMatch;
  /** 아직 불러오지 않았으면 없음 */
  sharing?: LocationSharing;
  busy?: boolean;
  onAction: (action: ArrivalAction) => void;
  /** 테스트에서 시각을 고정할 때만 넘긴다 */
  now?: Date;
};

const StatusTones: Record<LocationSharingStatus, StatusTone> = {
  notStarted: 'cancelled',
  sharing: 'matched',
  nearby: 'inProgress',
  arrived: 'completed',
  paused: 'pending',
  unavailable: 'noShow',
  ended: 'cancelled',
};

/** 동의 전에 알리는 내용. 법률 문구가 아니라 무엇이 일어나는지를 말하는 안내다. */
const ConsentPoints = [
  '위치 공유는 이 간병 일정 시작 전후에만 사용됩니다.',
  '간병을 시작하거나 끝내거나 예약이 취소되면 자동으로 끝납니다.',
  '언제든 일시 중지하거나 종료할 수 있습니다.',
  '보호자에게는 정확한 위치가 아니라 이동 상태와 예상 도착 시각만 보입니다.',
];

/**
 * 안심 도착 — 간병인 쪽 (Phase 13).
 *
 * 간병 시작 전의 수락된 매칭에만 쓴다. 누를 수 있는 버튼은 지금 상태와 시간대가 정한다.
 *   - 공유 시간대 전: 버튼 없이 언제부터 알릴 수 있는지만
 *   - 이동 전: 동의 → 이동 시작 (도착 완료는 공유 없이도 누를 수 있다)
 *   - 이동 중·인근: 인근 · 도착 완료 · 일시 중지 · 종료
 *   - 일시 중지: 재개 · 도착 완료 · 종료
 *   - 도착 완료: 버튼 없음
 *
 * 매칭 카드와 합치지 않고 따로 둔다. 매칭 카드에는 이미 시작·종료·취소가 있고, 이동 버튼까지
 * 한 카드에 섞으면 "간병 시작"과 "이동 시작"을 헷갈리기 쉽다.
 */
export function CaregiverArrivalPanel({
  match,
  sharing,
  busy = false,
  onAction,
  now = new Date(),
}: CaregiverArrivalPanelProps) {
  if (match.status !== 'accepted') {
    return null;
  }

  const startsAt = scheduledStartAt(match.care);
  const withinWindow = isWithinSharingWindow(match.care, now);

  return (
    <Card>
      <View style={styles.header}>
        <AppText variant="subheading">안심 도착</AppText>
        {sharing ? (
          <StatusBadge
            tone={StatusTones[sharing.status]}
            label={LocationSharingStatusLabels[sharing.status]}
          />
        ) : null}
      </View>

      {!sharing ? (
        <AppText variant="caption" tone="secondary">
          이동 상태를 불러오는 중입니다
        </AppText>
      ) : sharing.status === 'arrived' ? (
        <AppText variant="body" tone="secondary">
          {sharing.arrivedAt ? `${formatClockTime(sharing.arrivedAt)}에 ` : ''}도착을 알렸습니다. 간병을
          시작하면 위치 공유가 끝납니다.
        </AppText>
      ) : sharing.status === 'notStarted' || sharing.status === 'ended' ? (
        !withinWindow ? (
          <AppText variant="body" tone="secondary">
            {formatKoreanDate(match.care.startDate)} {formatClockTime(startsAt.toISOString())} 시작
            예정입니다. 시작 {SharingWindowHours}시간 전부터 이동을 알릴 수 있습니다.
          </AppText>
        ) : (
          <>
            {sharing.status === 'ended' ? (
              <AppText variant="caption" tone="secondary">
                위치 공유를 종료했습니다. 필요하면 다시 시작할 수 있습니다.
              </AppText>
            ) : null}

            {!sharing.consentGiven ? (
              <View style={styles.consent}>
                <AppText variant="label">위치 공유 안내</AppText>
                <AppText variant="caption" tone="secondary">
                  {ConsentPoints.map((point) => `· ${point}`).join('\n')}
                </AppText>
                <AppButton
                  title="안내를 확인했고 동의합니다"
                  loading={busy}
                  disabled={busy}
                  onPress={() => onAction('giveConsent')}
                />
              </View>
            ) : (
              <AppButton
                title="이동 시작"
                loading={busy}
                disabled={busy}
                onPress={() => onAction('start')}
              />
            )}

            <AppButton
              title="도착 완료"
              variant="outline"
              disabled={busy}
              onPress={() => onAction('markArrived')}
            />
          </>
        )
      ) : (
        <>
          <AppText variant="body" tone="secondary">
            {sharing.estimatedArrivalAt
              ? `예상 도착 ${formatClockTime(sharing.estimatedArrivalAt)}`
              : '예상 도착 시각 없음'}
            {sharing.lastUpdatedAt ? ` · 마지막 업데이트 ${formatClockTime(sharing.lastUpdatedAt)}` : ''}
          </AppText>

          {sharing.status === 'unavailable' ? (
            <AppText variant="caption" tone="danger">
              한동안 업데이트가 없어 보호자에게 &apos;위치 확인 불가&apos;로 보입니다. 지금 상태를 다시
              알려 주세요.
            </AppText>
          ) : null}
          {sharing.status === 'paused' ? (
            <AppText variant="caption" tone="secondary">
              위치 공유를 일시 중지했습니다. 보호자에게 중지했다고 표시됩니다.
            </AppText>
          ) : null}

          <View style={styles.actions}>
            {sharing.status === 'paused' ? (
              <AppButton
                title="위치 공유 재개"
                style={styles.action}
                loading={busy}
                disabled={busy}
                onPress={() => onAction('resume')}
              />
            ) : sharing.status !== 'nearby' ? (
              <AppButton
                title="약속 장소 인근"
                style={styles.action}
                loading={busy}
                disabled={busy}
                onPress={() => onAction('markNearby')}
              />
            ) : null}
            <AppButton
              title="도착 완료"
              style={styles.action}
              variant={sharing.status === 'nearby' ? 'primary' : 'secondary'}
              disabled={busy}
              onPress={() => onAction('markArrived')}
            />
          </View>

          {sharing.status !== 'paused' ? (
            <AppButton
              title="위치 공유 일시 중지"
              variant="outline"
              disabled={busy}
              onPress={() => onAction('pause')}
            />
          ) : null}
          <AppButton
            title="위치 공유 종료"
            variant="outline"
            disabled={busy}
            onPress={() => onAction('stop')}
          />
        </>
      )}
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
  consent: {
    gap: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  action: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
});
