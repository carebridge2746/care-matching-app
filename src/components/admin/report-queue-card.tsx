import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { StarRating } from '@/components/common/star-rating';
import { StatusBadge } from '@/components/common/status-badge';
import { formatKoreanTimestamp } from '@/lib/date';
import { Colors, Radius, Spacing, type StatusTone } from '@/theme';
import {
  ReviewReportReasonLabels,
  ReviewReportStatusLabels,
  type AdminReviewReport,
  type ReviewReportStatus,
} from '@/types';

const ReportStatusTones: Record<ReviewReportStatus, StatusTone> = {
  open: 'pending',
  accepted: 'noShow',
  dismissed: 'cancelled',
};

export type ReportQueueCardProps = {
  report: AdminReviewReport;
  busy?: boolean;
  onDelete?: () => void;
  onDismiss?: () => void;
  onRestore?: () => void;
};

/**
 * 신고 큐의 한 줄.
 *
 * 신고 내용을 위에, 신고당한 후기를 그 아래 칸에 따로 둔다. 둘을 같은 글씨로 이어 두면
 * 신고한 사람의 말과 후기 작성자의 말이 섞여 읽힌다.
 *
 * 누를 수 있는 버튼은 신고 상태가 아니라 후기 상태로 정한다. 같은 후기에 신고가 여럿이면
 * 하나를 처리할 때 나머지도 함께 바뀌어서, 신고 한 줄의 상태만 보고는 틀릴 수 있다.
 */
export function ReportQueueCard({
  report,
  busy = false,
  onDelete,
  onDismiss,
  onRestore,
}: ReportQueueCardProps) {
  const isReviewDeleted = report.reviewDeletedAt !== undefined;
  const canDelete = report.status === 'open' && !isReviewDeleted;
  const canDismiss = report.status === 'open';
  const canRestore = isReviewDeleted;

  return (
    <Card>
      <View style={styles.header}>
        <AppText variant="subheading">{ReviewReportReasonLabels[report.reason]}</AppText>
        <StatusBadge
          tone={ReportStatusTones[report.status]}
          label={ReviewReportStatusLabels[report.status]}
        />
      </View>

      <AppText variant="caption" tone="secondary">
        {report.reporterName} 님이 {formatKoreanTimestamp(report.createdAt)}에 신고
        {report.reportCount > 1 ? ` · 이 후기에 신고 ${report.reportCount}건` : ''}
      </AppText>
      {report.detail ? <AppText variant="body">{report.detail}</AppText> : null}

      <View style={styles.review}>
        <View style={styles.header}>
          <StarRating value={report.rating} />
          <AppText variant="caption" tone="tertiary">
            {formatKoreanTimestamp(report.reviewCreatedAt)}
          </AppText>
        </View>
        <AppText variant="label">
          {report.reviewerName} → {report.revieweeName}
        </AppText>
        <AppText variant="body" tone={report.comment ? 'primary' : 'tertiary'}>
          {report.comment ?? '(별점만 남긴 후기입니다)'}
        </AppText>
        {isReviewDeleted && report.reviewDeletedAt ? (
          <AppText variant="caption" tone="danger">
            {formatKoreanTimestamp(report.reviewDeletedAt)}에 삭제된 후기입니다
          </AppText>
        ) : null}
      </View>

      {report.resolvedAt ? (
        <AppText variant="caption" tone="secondary">
          {formatKoreanTimestamp(report.resolvedAt)} 처리
          {report.resolutionNote ? ` · ${report.resolutionNote}` : ''}
        </AppText>
      ) : null}

      {(canDelete && onDelete) || (canDismiss && onDismiss) ? (
        <View style={styles.actions}>
          {canDelete && onDelete ? (
            <AppButton
              title="후기 삭제"
              variant="danger"
              style={styles.action}
              loading={busy}
              disabled={busy}
              onPress={onDelete}
            />
          ) : null}
          {canDismiss && onDismiss ? (
            <AppButton
              title="신고 반려"
              variant="outline"
              style={styles.action}
              disabled={busy}
              onPress={onDismiss}
            />
          ) : null}
        </View>
      ) : null}

      {canRestore && onRestore ? (
        <AppButton
          title="후기 복구"
          variant="outline"
          loading={busy}
          disabled={busy}
          onPress={onRestore}
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
  review: {
    gap: Spacing.xs,
    padding: Spacing.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface.subtle,
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
