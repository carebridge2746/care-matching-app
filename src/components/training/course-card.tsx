import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { StatusBadge } from '@/components/common/status-badge';
import { formatKoreanTimestamp } from '@/lib/date';
import { courseProgressLabel } from '@/lib/training';
import { Spacing } from '@/theme';
import type { QuizAttempt, TrainingCompletion, TrainingCourse } from '@/types';

export type CourseCardProps = {
  course: TrainingCourse;
  /** 이 과정을 수료했으면 그 기록 */
  completion?: TrainingCompletion;
  /** 내 응시 기록 전체. 이 과정의 것만 골라서 최고 점수를 보여 준다. */
  attempts: QuizAttempt[];
  onPress: () => void;
};

/**
 * 교육 과정 한 줄.
 *
 * 수료 여부를 배지로 먼저 보여 주고, 그 아래에 지금 할 수 있는 일을 한 줄로 적는다.
 * 아직 안 들은 과정에는 걸리는 시간과 문항 수를, 떨어진 과정에는 최고 점수와 합격선을
 * 보여 준다 — "다시 풀어 보세요"만 있으면 얼마나 모자랐는지 알 수 없다.
 */
export function CourseCard({ course, completion, attempts, onPress }: CourseCardProps) {
  return (
    <Card onPress={onPress}>
      <View style={styles.header}>
        <AppText variant="subheading" style={styles.title}>
          {course.title}
        </AppText>
        {completion ? <StatusBadge tone="completed" label="수료" /> : null}
      </View>

      <AppText variant="body" tone="secondary">
        {course.summary}
      </AppText>

      <AppText variant="caption" tone="tertiary">
        {courseProgressLabel(course, completion, attempts)}
        {completion ? ` · ${formatKoreanTimestamp(completion.completedAt)}` : ''}
      </AppText>

      {course.certificationLabel ? (
        <AppText variant="caption" tone={completion ? 'success' : 'secondary'}>
          {completion
            ? `프로필에 '${course.certificationLabel}' 수료가 표시됩니다`
            : `수료하면 '${course.certificationLabel}'로 표시됩니다`}
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
  },
  title: {
    flexShrink: 1,
  },
});
