import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { formatKoreanTimestamp } from '@/lib/date';
import { Spacing } from '@/theme';
import type { TrainingCompletion, TrainingCourse } from '@/types';

export type CompletionListProps = {
  courses: TrainingCourse[];
  completions: TrainingCompletion[];
  /** 아직 수료한 교육이 없을 때 보여 줄 문장 */
  emptyMessage: string;
};

/**
 * 수료한 교육.
 *
 * 간병인이 직접 고른 자격(프로필의 '보유 자격')과 나란히 두지 않고 따로 보여 준다.
 * 한쪽은 본인이 신고한 값이고 이쪽은 앱이 퀴즈로 확인한 값이라, 한 줄에 섞어 두면
 * 보호자가 무엇이 확인된 것인지 알 수 없게 된다.
 */
export function CompletionList({ courses, completions, emptyMessage }: CompletionListProps) {
  const courseById = new Map(courses.map((course) => [course.id, course]));

  if (completions.length === 0) {
    return (
      <Card>
        <AppText variant="body" tone="secondary">
          {emptyMessage}
        </AppText>
      </Card>
    );
  }

  return (
    <View style={styles.container}>
      {completions.map((completion) => {
        const course = courseById.get(completion.courseId);

        // 과정이 내려간 뒤에도 수료 기록은 남는다. 이름을 모르면 줄을 그리지 않는다.
        if (!course) {
          return null;
        }

        return (
          <Card key={completion.id}>
            <AppText variant="subheading">{course.title}</AppText>
            {course.certificationLabel ? (
              <AppText variant="body" tone="success">
                {course.certificationLabel}
              </AppText>
            ) : null}
            <AppText variant="caption" tone="tertiary">
              {formatKoreanTimestamp(completion.completedAt)} 수료
            </AppText>
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
});
