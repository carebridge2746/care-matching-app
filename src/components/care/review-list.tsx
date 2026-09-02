import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { StarRating } from '@/components/common/star-rating';
import { formatKoreanTimestamp } from '@/lib/date';
import { Spacing } from '@/theme';
import { formatRating, type PublicReview, type UserRating } from '@/types';

export type ReviewListProps = {
  rating: UserRating;
  reviews: PublicReview[];
  /** 후기가 아직 없을 때 보여 줄 문장 */
  emptyMessage: string;
};

/**
 * 받은 평가와 후기 목록.
 *
 * 평균을 먼저 보여 주고 그 아래에 한 건씩 편다. 총점만 있으면 왜 그 점수인지 알 수 없고,
 * 목록만 있으면 전체가 어떤지 한눈에 들어오지 않는다.
 *
 * 작성자 이름은 성만 보인다(김OO). 후기를 누가 썼는지는 당사자끼리만 알면 된다.
 */
export function ReviewList({ rating, reviews, emptyMessage }: ReviewListProps) {
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
      </Card>

      {reviews.map((review) => (
        <Card key={review.id}>
          <View style={styles.header}>
            <StarRating value={review.rating} />
            <AppText variant="caption" tone="tertiary">
              {review.reviewerName} · {formatKoreanTimestamp(review.createdAt)}
            </AppText>
          </View>
          {review.comment ? <AppText variant="body">{review.comment}</AppText> : null}
        </Card>
      ))}
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
});
