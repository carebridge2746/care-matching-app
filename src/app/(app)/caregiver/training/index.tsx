import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, EmptyState, LoadingView, Screen } from '@/components/common';
import { CourseCard } from '@/components/training';
import { completionOf } from '@/lib/training';
import { useAuthStore } from '@/store/use-auth-store';
import { useTrainingStore } from '@/store/use-training-store';
import { Spacing } from '@/theme';

/**
 * 교육 과정 목록.
 *
 * 아직 수료하지 않은 과정을 위에 둔다. 수료한 과정은 이미 할 일이 없으므로
 * 아래로 내리되 지우지는 않는다 — 언제 무엇을 마쳤는지가 이력이기 때문이다.
 *
 * 과정 내용은 운영자가 데이터베이스에서 늘리고 고친다. 화면에 돌아올 때마다 다시
 * 불러오는 것은 그 때문이다.
 */
export default function TrainingListScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const courses = useTrainingStore((state) => state.courses);
  const attempts = useTrainingStore((state) => state.attempts);
  const completions = useTrainingStore((state) => state.completions);
  const isLoading = useTrainingStore((state) => state.isLoading);
  const errorMessage = useTrainingStore((state) => state.errorMessage);
  const load = useTrainingStore((state) => state.load);

  const caregiverId = user?.id;

  useFocusEffect(
    useCallback(() => {
      if (caregiverId) {
        void load(caregiverId);
      }
    }, [caregiverId, load])
  );

  if (isLoading && courses.length === 0) {
    return <LoadingView message="교육 과정을 불러오는 중입니다" />;
  }

  const todo = courses.filter((course) => !completionOf(completions, course.id));
  const done = courses.filter((course) => completionOf(completions, course.id));

  return (
    <Screen scroll edges={['bottom']}>
      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}

      <View style={styles.intro}>
        <AppText variant="body" tone="secondary">
          교육 내용을 읽고 퀴즈를 푸시면 수료로 남습니다. 몇 번이든 다시 푸실 수 있고,
          수료한 교육은 프로필에 함께 표시됩니다.
        </AppText>
      </View>

      {courses.length === 0 ? (
        <EmptyState
          title="아직 열린 교육이 없습니다"
          description="새 교육 과정이 열리면 여기에 표시됩니다."
        />
      ) : null}

      {todo.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="heading">들을 수 있는 교육</AppText>
          {todo.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              attempts={attempts}
              onPress={() => router.push(`/caregiver/training/${course.id}`)}
            />
          ))}
        </View>
      ) : null}

      {done.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="heading">수료한 교육</AppText>
          <AppText variant="caption" tone="secondary">
            수료일은 처음 합격하신 날입니다. 다시 푸셔도 날짜는 그대로 남습니다.
          </AppText>
          {done.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              completion={completionOf(completions, course.id)}
              attempts={attempts}
              onPress={() => router.push(`/caregiver/training/${course.id}`)}
            />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    paddingTop: Spacing.sm,
  },
  section: {
    gap: Spacing.md,
    paddingTop: Spacing.md,
  },
});
