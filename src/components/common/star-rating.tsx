import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/app-text';
import { Colors, Spacing } from '@/theme';
import { MaxRating, MinRating, RatingLabels } from '@/types';

export type StarRatingProps = {
  /** 지금 별점. 0이면 아직 고르지 않은 것이다. */
  value: number;
  /** 값을 주면 눌러서 고를 수 있다. 없으면 보여 주기만 한다. */
  onChange?: (value: number) => void;
  /** 별 옆에 숫자와 뜻을 함께 보여 줄지 */
  showLabel?: boolean;
  disabled?: boolean;
};

const Stars = Array.from({ length: MaxRating }, (_, index) => index + MinRating);

/**
 * 별점.
 *
 * 별의 개수만으로 알리지 않고 '4점 · 좋았습니다'처럼 숫자와 뜻을 함께 보여 준다.
 * 색과 모양만으로 구분하면 눈이 어두운 분에게는 몇 점인지 읽히지 않는다.
 *
 * 고르는 별은 터치 영역을 크게 잡는다. 별 하나가 작으면 옆 별이 눌린다.
 */
export function StarRating({ value, onChange, showLabel = false, disabled = false }: StarRatingProps) {
  const isInteractive = Boolean(onChange) && !disabled;

  return (
    <View style={styles.container}>
      <View style={styles.stars}>
        {Stars.map((star) => {
          const filled = star <= value;
          const icon = (
            <AppText
              variant={isInteractive ? 'title' : 'body'}
              style={[styles.star, { color: filled ? Colors.feedback.warning : Colors.text.tertiary }]}>
              {filled ? '★' : '☆'}
            </AppText>
          );

          return isInteractive ? (
            <Pressable
              key={star}
              accessibilityRole="button"
              accessibilityLabel={`${star}점 · ${RatingLabels[star]}`}
              accessibilityState={{ selected: filled }}
              hitSlop={Spacing.xs}
              style={styles.touch}
              onPress={() => onChange?.(star)}>
              {icon}
            </Pressable>
          ) : (
            <View key={star}>{icon}</View>
          );
        })}
      </View>

      {showLabel ? (
        <AppText variant="body" tone="secondary">
          {value >= MinRating ? `${value}점 · ${RatingLabels[value]}` : '별점을 골라 주세요'}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  stars: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  touch: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: {
    letterSpacing: 2,
  },
});
