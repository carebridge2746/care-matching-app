import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { StarRating } from '@/components/common/star-rating';
import { ReviewReportForm } from '@/components/care/review-report-form';
import { formatKoreanTimestamp } from '@/lib/date';
import { Spacing } from '@/theme';
import {
  formatRating,
  ReviewReportStatusLabels,
  type PublicReview,
  type ReviewReport,
  type ReviewReportInput,
  type UserRating,
} from '@/types';

export type ReviewListProps = {
  rating: UserRating;
  reviews: PublicReview[];
  /** 후기가 아직 없을 때 보여 줄 문장 */
  emptyMessage: string;
  /** 내가 낸 신고. 주면 후기마다 신고했는지와 처리 결과가 보인다. */
  reports?: ReviewReport[];
  /**
   * 값을 주면 후기마다 신고 버튼이 보인다.
   * 신고가 받아들여지면 true 를 돌려준다 — 그때만 폼을 닫는다.
   * 실패했는데 닫으면 고른 사유와 적은 설명이 사라져서 다시 쓰지 않는다.
   */
  onReport?: (reviewId: string, input: ReviewReportInput) => Promise<boolean>;
  /** 신고를 보내는 중인 후기 id */
  reportingReviewId?: string | null;
};

/**
 * 받은 평가와 후기 목록.
 *
 * 평균을 먼저 보여 주고 그 아래에 한 건씩 편다. 총점만 있으면 왜 그 점수인지 알 수 없고,
 * 목록만 있으면 전체가 어떤지 한눈에 들어오지 않는다.
 *
 * 작성자 이름은 성만 보인다(김OO). 후기를 누가 썼는지는 당사자끼리만 알면 된다.
 *
 * 신고 버튼은 카드 아래쪽에 작게 둔다. 후기를 읽는 자리에서 바로 누를 수 있어야 하지만,
 * 눈에 띄게 두면 마음에 들지 않는 후기마다 누르게 된다.
 */
export function ReviewList({
  rating,
  reviews,
  emptyMessage,
  reports = [],
  onReport,
  reportingReviewId = null,
}: ReviewListProps) {
  /** 신고 폼을 펼쳐 둔 후기. 한 번에 하나만 연다. */
  const [openReviewId, setOpenReviewId] = useState<string | null>(null);

  // 받아들여진 신고의 후기는 목록에서 이미 빠져 있다. 아무 말 없이 사라지면
  // 신고한 사람은 무슨 일이 있었는지 알 수 없으므로 한 줄로 알려 준다.
  const removedCount = reports.filter(
    (report) =>
      report.status === 'accepted' && !reviews.some((review) => review.id === report.reviewId)
  ).length;

  return (
    <View style={styles.container}>
      <Card>
        <View style={styles.summary}>
          <StarRating value={Math.round(rating.ratingAvg ?? 0)} />
          <AppText variant="subheading">{formatRating(rating)}</AppText>
        </View>
        {reviews.length === 0 ? (
          <AppText variant="body" tone="secondary">
            {emptyMessage}
          </AppText>
        ) : null}
        {removedCount > 0 ? (
          <AppText variant="caption" tone="secondary">
            신고하신 후기 {removedCount}건이 확인을 거쳐 삭제되었습니다. 평균에서도 빠졌습니다.
          </AppText>
        ) : null}
      </Card>

      {reviews.map((review) => {
        const report = reports.find((item) => item.reviewId === review.id);

        if (onReport && openReviewId === review.id) {
          return (
            <ReviewReportForm
              key={review.id}
              busy={reportingReviewId === review.id}
              onDismiss={() => setOpenReviewId(null)}
              onSubmit={(input) => {
                void onReport(review.id, input).then((reported) => {
                  if (reported) {
                    setOpenReviewId(null);
                  }
                });
              }}
            />
          );
        }

        return (
          <Card key={review.id}>
            <View style={styles.header}>
              <StarRating value={review.rating} />
              <AppText variant="caption" tone="tertiary">
                {review.reviewerName} · {formatKoreanTimestamp(review.createdAt)}
              </AppText>
            </View>
            {review.comment ? <AppText variant="body">{review.comment}</AppText> : null}

            {report ? (
              <AppText variant="caption" tone="secondary">
                신고하셨습니다 · {ReviewReportStatusLabels[report.status]}
              </AppText>
            ) : onReport ? (
              <AppButton
                title="이 후기 신고하기"
                variant="outline"
                style={styles.reportButton}
                disabled={reportingReviewId !== null}
                onPress={() => setOpenReviewId(review.id)}
              />
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
    flexWrap: 'wrap',
  },
  reportButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.md,
  },
});
