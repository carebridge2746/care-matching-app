import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { StatusBadge } from '@/components/common/status-badge';
import { canStartCareAt, careWindowOpensAt, formatScheduledStart } from '@/lib/arrival';
import {
  formatClockTime,
  formatKoreanDate,
  formatKoreanTimestamp,
  formatPeriod,
  toIsoDate,
} from '@/lib/date';
import { canReportNoShow, isMatchOverdue } from '@/lib/no-show';
import { ContactRetentionDays, isContactOpen } from '@/lib/privacy';
import { Layout, Spacing } from '@/theme';
import {
  ageFromBirthYear,
  CareTypeLabels,
  GenderLabels,
  isMatchLive,
  MatchCancellerLabels,
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
  /**
   * 보호자 화면에만 쓴다. 값을 주면 시작일이 온 뒤로 노쇼 신고 버튼이 보인다.
   * 오지 않았다는 것을 아는 사람은 그 자리에 있던 보호자뿐이다.
   */
  onReportNoShow?: () => void;
  /** 끝난 간병에만 쓴다. 값을 주면 후기 작성 버튼이 보인다. */
  onReview?: () => void;
  /** 이 간병에 이미 후기를 남겼는지. 남겼으면 버튼 대신 그 사실을 보여 준다. */
  reviewed?: boolean;
  /**
   * 남긴 후기를 관리자가 지웠는지.
   * 지워진 후기도 다시 쓸 수는 없으므로, 버튼이 없는 이유를 함께 알려 준다.
   */
  reviewDeleted?: boolean;
  /** 값을 주면 요청 상세로 가는 링크가 보인다 */
  onPress?: () => void;
  /** 테스트에서 시각을 고정할 때만 넘긴다 */
  now?: Date;
};

/**
 * 간병 한 건의 진행 상태.
 *
 * 보호자와 간병인이 같은 카드를 본다. 다른 것은 두 가지뿐이다 —
 * 상대방이 누구인지, 그리고 지금 누를 수 있는 버튼이 무엇인지.
 *
 * 간병 시작은 출근한 간병인만 누른다. 종료는 양쪽 모두 누를 수 있다 —
 * 한쪽만 누를 수 있게 하면 상대가 앱을 열지 않는 동안 간병이 계속 진행중으로 남는다.
 *
 * 카드 전체를 누르는 영역으로 두지 않는다. 카드 안에 시작·종료 버튼이 있어서, 카드까지
 * 버튼이면 웹에서 버튼 안에 버튼이 들어가고(잘못된 HTML), 버튼을 누르려다 상세로 넘어가기 쉽다.
 * 상세로 가는 길은 따로 링크로 둔다.
 */
export function MatchCard({
  match,
  viewer,
  busy = false,
  onStart,
  onComplete,
  onCancel,
  onReportNoShow,
  onReview,
  reviewed = false,
  reviewDeleted = false,
  onPress,
  now = new Date(),
}: MatchCardProps) {
  /** 종료 확인을 펼쳤는지. 종료는 되돌릴 수 없어서 한 번 더 묻는다. */
  const [isConfirmingComplete, setConfirmingComplete] = useState(false);

  const { patient, care } = match;
  const counterpart = viewer === 'guardian' ? match.caregiver : match.guardian;
  const counterpartLabel = MatchPartyLabels[viewer === 'guardian' ? 'caregiver' : 'guardian'];

  const isLive = isMatchLive(match.status);
  const isAwaitingStart = isLive && viewer === 'caregiver' && match.status === 'accepted';
  // 약속한 시작 몇 시간 전부터 누를 수 있다. 저장소도 같은 판정을 한다 — 여기서는 버튼을 감출 뿐이다.
  const isStartOpen = canStartCareAt(care, now);
  const startOpensAt = careWindowOpensAt(care);
  const canStart = isAwaitingStart && isStartOpen;
  const canComplete = isLive && match.status === 'inProgress';
  // 시작일이 지났는데 아직 시작되지 않았다. 이것만으로 노쇼는 아니지만 확인이 필요하다.
  const isOverdue = isMatchOverdue(match);
  const canReport = Boolean(onReportNoShow) && viewer === 'guardian' && canReportNoShow(match, now);
  // 시작일이 되었는데 아직 시작 시각 전이라 신고 버튼이 없다. 왜 없는지 알려 준다.
  const isWaitingForStartTime =
    Boolean(onReportNoShow) &&
    viewer === 'guardian' &&
    match.status === 'accepted' &&
    !canReport &&
    care.startDate <= toIsoDate(now);

  return (
    <Card>
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
      {/* 연락처가 왜 사라졌는지 말해 주지 않으면 앱이 고장 난 것으로 읽힌다 */}
      {match.status === 'completed' && !isContactOpen(match) ? (
        <AppText variant="caption" tone="tertiary">
          간병이 끝나고 {ContactRetentionDays}일이 지나 연락처를 가렸습니다.
        </AppText>
      ) : null}

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
          {match.cancelledBy ? ` · ${MatchCancellerLabels[match.cancelledBy]}가 취소` : ''}
          {match.cancelReason ? ` · ${match.cancelReason}` : ''}
        </AppText>
      ) : match.status === 'noShow' && match.noShowAt ? (
        <AppText variant="caption" tone="danger">
          {formatKoreanTimestamp(match.noShowAt)}에 오지 않은 것으로 신고되었습니다
          {match.noShowNote ? ` · ${match.noShowNote}` : ''}
        </AppText>
      ) : (
        <AppText variant="caption" tone="secondary">
          {formatKoreanTimestamp(match.acceptedAt)}에 매칭되었습니다
        </AppText>
      )}

      {/*
        시작일이 지났는데 시작되지 않은 간병. 여기서 노쇼라고 부르지는 않는다 —
        간병인이 와 있는데 시작 버튼만 누르지 않았을 수도 있고, 둘이 이야기해서 미뤘을 수도 있다.
        무슨 일이 있었는지는 그 자리에 있던 사람만 안다.
      */}
      {isOverdue ? (
        <AppText variant="caption" tone="danger">
          {formatKoreanDate(care.startDate)}에 시작하기로 한 간병이 아직 시작되지 않았습니다.
          {viewer === 'guardian'
            ? ' 간병인께 연락이 닿는지 확인해 주세요.'
            : ' 이미 가 계시다면 간병 시작을 눌러 주세요.'}
        </AppText>
      ) : null}

      {isAwaitingStart && !isStartOpen ? (
        <AppText variant="caption" tone="secondary">
          {formatKoreanDate(toIsoDate(startOpensAt))} {formatClockTime(startOpensAt.toISOString())}부터
          간병 시작을 누를 수 있습니다.
        </AppText>
      ) : null}

      {isWaitingForStartTime ? (
        <AppText variant="caption" tone="secondary">
          간병 시작 시각({formatScheduledStart(care)})이 지나도 오지 않으면 신고할 수 있습니다.
        </AppText>
      ) : null}

      {isConfirmingComplete && canComplete && onComplete ? (
        <View style={styles.confirm}>
          <AppText variant="body">간병을 종료할까요?</AppText>
          <AppText variant="caption" tone="secondary">
            종료하면 되돌릴 수 없습니다. 종료한 뒤에 후기를 남길 수 있습니다.
          </AppText>
          <View style={styles.actions}>
            <AppButton
              title="네, 종료합니다"
              style={styles.action}
              loading={busy}
              disabled={busy}
              onPress={onComplete}
            />
            <AppButton
              title="아니요"
              variant="outline"
              style={styles.action}
              disabled={busy}
              onPress={() => setConfirmingComplete(false)}
            />
          </View>
        </View>
      ) : isLive && (canStart || canComplete || onCancel) ? (
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
              disabled={busy}
              onPress={() => setConfirmingComplete(true)}
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

      {/*
        노쇼 신고는 취소와 나란히 두지 않고 한 줄 아래에 따로 둔다.
        같은 줄에 놓으면 취소하려다 잘못 누르기 쉬운데, 신고는 되돌릴 수 없다.
      */}
      {canReport && onReportNoShow && !isConfirmingComplete ? (
        <AppButton
          title="간병인이 오지 않았습니다"
          variant="outline"
          disabled={busy}
          onPress={onReportNoShow}
        />
      ) : null}

      {/* 후기는 끝난 간병에만 남길 수 있다. 취소된 간병에는 평가할 간병이 없었다. */}
      {match.status === 'completed' ? (
        reviewed && reviewDeleted ? (
          <AppText variant="caption" tone="secondary">
            남기신 후기는 신고 확인을 거쳐 삭제되었습니다. 이 간병에는 후기를 다시 남길 수 없습니다.
          </AppText>
        ) : reviewed ? (
          <AppText variant="caption" tone="success">
            후기를 남기셨습니다
          </AppText>
        ) : onReview ? (
          <AppButton title="후기 남기기" variant="secondary" disabled={busy} onPress={onReview} />
        ) : null
      ) : null}

      {onPress ? (
        <Pressable
          accessibilityRole="link"
          onPress={onPress}
          style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
          <AppText variant="label" tone="brand">
            요청 자세히 보기 ›
          </AppText>
        </Pressable>
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
  confirm: {
    gap: Spacing.xs,
    paddingTop: Spacing.xs,
  },
  link: {
    alignSelf: 'flex-start',
    minHeight: Layout.minTouchHeight,
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
});
