import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton, AppText, Card, EmptyState, LoadingView, Screen } from '@/components/common';
import { LessonCard, QuizForm, QuizResult } from '@/components/training';
import { formatKoreanTimestamp } from '@/lib/date';
import { bestScoreOf, completionOf } from '@/lib/training';
import { useAuthStore } from '@/store/use-auth-store';
import { useTrainingStore } from '@/store/use-training-store';
import { Spacing } from '@/theme';

/**
 * 교육 과정 하나 — 읽고, 풀고, 결과를 본다.
 *
 * 한 화면 안에서 세 단계가 이어진다. 교육 내용을 읽는 자리(lesson), 퀴즈를 푸는
 * 자리(quiz), 채점 결과를 보는 자리(result)다. 화면을 나눠 두면 퀴즈를 풀다가
 * 내용을 다시 보려는 사람이 매번 뒤로 갔다 와야 한다.
 *
 * 어느 단계인지는 저장소가 들고 있는 채점 결과(grade)로 정한다. 결과가 있으면
 * 언제나 결과를 보여 준다 — 방금 낸 답의 결과를 못 보고 지나치는 일이 없어야 한다.
 */
export default function TrainingCourseScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);

  const course = useTrainingStore((state) => state.course);
  const questions = useTrainingStore((state) => state.questions);
  const isCourseLoading = useTrainingStore((state) => state.isCourseLoading);
  const attempts = useTrainingStore((state) => state.attempts);
  const completions = useTrainingStore((state) => state.completions);
  const loadedCaregiverId = useTrainingStore((state) => state.loadedCaregiverId);
  const grade = useTrainingStore((state) => state.grade);
  const isSubmitting = useTrainingStore((state) => state.isSubmitting);
  const errorMessage = useTrainingStore((state) => state.errorMessage);

  const load = useTrainingStore((state) => state.load);
  const openCourse = useTrainingStore((state) => state.openCourse);
  const clearGrade = useTrainingStore((state) => state.clearGrade);
  const submitQuiz = useTrainingStore((state) => state.submitQuiz);

  /** 퀴즈를 펼쳐 두었는지. 채점 결과가 있으면 이 값과 상관없이 결과를 보여 준다. */
  const [isQuizOpen, setQuizOpen] = useState(false);

  const caregiverId = user?.id;

  useEffect(() => {
    if (id) {
      void openCourse(id);
    }
  }, [id, openCourse]);

  // 목록을 거치지 않고 바로 들어왔으면 내 수료·응시 기록이 아직 없다
  useEffect(() => {
    if (caregiverId && loadedCaregiverId !== caregiverId) {
      void load(caregiverId);
    }
  }, [caregiverId, load, loadedCaregiverId]);

  if (isCourseLoading && !course) {
    return <LoadingView message="교육 내용을 불러오는 중입니다" />;
  }
  if (!course || !caregiverId) {
    return (
      <Screen edges={['bottom']}>
        <EmptyState
          title="교육 과정을 찾지 못했습니다"
          description={errorMessage ?? '과정이 내려갔거나 주소가 바뀌었을 수 있습니다.'}
          actionTitle="교육 목록으로"
          onAction={() => router.replace('/caregiver/training')}
        />
      </Screen>
    );
  }

  const completion = completionOf(completions, course.id);
  const best = bestScoreOf(attempts, course.id);

  if (grade) {
    return (
      <Screen scroll edges={['bottom']}>
        <QuizResult
          course={course}
          questions={questions}
          grade={grade}
          onRetry={() => {
            clearGrade();
            setQuizOpen(true);
          }}
          onDone={() => {
            clearGrade();
            setQuizOpen(false);
            router.replace('/caregiver/training');
          }}
        />
      </Screen>
    );
  }

  if (isQuizOpen) {
    return (
      <Screen scroll edges={['bottom']}>
        {errorMessage ? (
          <AppText variant="body" tone="danger">
            {errorMessage}
          </AppText>
        ) : null}

        <QuizForm
          course={course}
          questions={questions}
          busy={isSubmitting}
          onCancel={() => setQuizOpen(false)}
          onSubmit={(answers) => {
            void submitQuiz(course.id, caregiverId, answers);
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      edges={['bottom']}
      footer={
        <AppButton
          title={completion ? '퀴즈 다시 풀기' : '퀴즈 풀기'}
          disabled={questions.length === 0}
          onPress={() => setQuizOpen(true)}
        />
      }>
      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}

      <View style={styles.intro}>
        <AppText variant="title">{course.title}</AppText>
        <AppText variant="body" tone="secondary">
          {course.summary}
        </AppText>
        <AppText variant="caption" tone="tertiary">
          약 {course.estimatedMinutes}분 · 퀴즈 {course.questionCount}문항 · {course.passScore}점
          이상이면 수료
        </AppText>
      </View>

      {completion ? (
        <Card>
          <AppText variant="subheading" tone="success">
            {formatKoreanTimestamp(completion.completedAt)} 수료
          </AppText>
          <AppText variant="body" tone="secondary">
            이미 수료하신 교육입니다. 다시 푸셔도 수료일은 그대로 남습니다.
          </AppText>
        </Card>
      ) : best !== undefined ? (
        <Card>
          <AppText variant="subheading">지금까지 최고 {best}점</AppText>
          <AppText variant="body" tone="secondary">
            {course.passScore}점 이상이면 수료합니다. 몇 번이든 다시 푸실 수 있습니다.
          </AppText>
        </Card>
      ) : null}

      {course.lessons.map((lesson) => (
        <LessonCard key={lesson.id} lesson={lesson} />
      ))}

      {questions.length === 0 ? (
        <AppText variant="body" tone="secondary">
          이 과정에는 아직 퀴즈가 없습니다. 교육 내용만 보실 수 있습니다.
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
});
