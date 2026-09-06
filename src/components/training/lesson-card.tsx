import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { Colors, Radius, Spacing } from '@/theme';
import type { TrainingLesson } from '@/types';

export type LessonCardProps = {
  lesson: TrainingLesson;
};

/**
 * 교육 내용 한 단원.
 *
 * 본문을 접어 두지 않고 그대로 편다. 펼쳐서 읽게 하면 대부분은 펼치지 않고,
 * 읽지 않은 채로 퀴즈에 들어간다.
 *
 * 아래의 '기억할 것'은 본문의 요약이 아니라 현장에서 손이 먼저 나가야 하는 것들이다.
 * 본문을 끝까지 읽지 못하고 화면을 닫아도 이것만은 남도록 따로 둔다.
 */
export function LessonCard({ lesson }: LessonCardProps) {
  return (
    <Card>
      <AppText variant="label" tone="brand">
        {lesson.order}단원
      </AppText>
      <AppText variant="subheading">{lesson.title}</AppText>

      {lesson.body.split('\n\n').map((paragraph, index) => (
        <AppText key={index} variant="body">
          {paragraph}
        </AppText>
      ))}

      {lesson.keyPoints.length > 0 ? (
        <View style={styles.keyPoints}>
          <AppText variant="label" tone="secondary">
            기억할 것
          </AppText>
          {lesson.keyPoints.map((point) => (
            <AppText key={point} variant="body">
              · {point}
            </AppText>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  keyPoints: {
    gap: Spacing.xs,
    marginTop: Spacing.xs,
    padding: Spacing.lg,
    borderRadius: Radius.md,
    backgroundColor: Colors.brand.primarySoft,
  },
});
