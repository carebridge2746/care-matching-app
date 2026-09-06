import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { StatusBadge } from '@/components/common/status-badge';
import { formatKoreanTimestamp } from '@/lib/date';
import { Spacing } from '@/theme';
import { formatQuizScore, type QuizGrade, type QuizQuestion, type TrainingCourse } from '@/types';

export type QuizResultProps = {
  course: TrainingCourse;
  questions: QuizQuestion[];
  grade: QuizGrade;
  /** 결과를 닫고 퀴즈를 다시 편다 */
  onRetry: () => void;
  /** 교육 목록으로 돌아간다 */
  onDone: () => void;
};

/**
 * 채점 결과.
 *
 * 맞은 문항에도 해설을 보여 준다. 틀린 것만 펼치면 찍어서 맞힌 문항이 배운 것으로 남는다.
 *
 * 떨어졌을 때 "불합격"으로 끝내지 않고 몇 점이 모자랐는지와 다시 풀 수 있다는 사실을
 * 함께 적는다. 이 교육은 걸러내기 위한 시험이 아니라 배우게 하려는 것이다.
 */
export function QuizResult({ course, questions, grade, onRetry, onDone }: QuizResultProps) {
  const { attempt, results } = grade;
  const questionById = new Map(questions.map((question) => [question.id, question]));

  return (
    <View style={styles.container}>
      <Card>
        <View style={styles.header}>
          <AppText variant="heading">{attempt.passed ? '수료하셨습니다' : '조금 모자랍니다'}</AppText>
          <StatusBadge
            tone={attempt.passed ? 'completed' : 'pending'}
            label={attempt.passed ? '합격' : '재응시 필요'}
          />
        </View>

        <AppText variant="body">{formatQuizScore(attempt)}</AppText>

        {attempt.passed ? (
          <AppText variant="body" tone="secondary">
            {grade.isNewCompletion
              ? '수료 기록이 남았습니다. 프로필에서 확인하실 수 있습니다.'
              : `이미 수료한 과정입니다. 수료일은 처음 합격하신 ${
                  grade.completedAt ? formatKoreanTimestamp(grade.completedAt) : '날'
                } 그대로입니다.`}
          </AppText>
        ) : (
          <AppText variant="body" tone="secondary">
            {course.passScore}점 이상이면 수료합니다. {course.passScore - attempt.score}점이
            모자랐습니다. 교육 내용을 다시 보시고 몇 번이든 다시 푸실 수 있습니다.
          </AppText>
        )}

        {attempt.passed && course.certificationLabel ? (
          <AppText variant="body" tone="success">
            {course.certificationLabel}
          </AppText>
        ) : null}
      </Card>

      <AppText variant="heading">문항별 결과</AppText>

      {results.map((result) => {
        const question = questionById.get(result.questionId);

        if (!question) {
          return null;
        }

        return (
          <Card key={result.questionId}>
            <View style={styles.header}>
              <AppText variant="label" tone="secondary">
                {question.order}번
              </AppText>
              <AppText variant="label" tone={result.isCorrect ? 'success' : 'danger'}>
                {result.isCorrect ? '정답' : '오답'}
              </AppText>
            </View>

            <AppText variant="bodyStrong">{question.question}</AppText>

            <AppText variant="body" tone="secondary">
              고르신 답:{' '}
              {result.selectedIndex === undefined
                ? '고르지 않으셨습니다'
                : question.choices[result.selectedIndex - 1]}
            </AppText>

            {result.isCorrect ? null : (
              <AppText variant="body">정답: {question.choices[result.answerIndex - 1]}</AppText>
            )}

            <AppText variant="caption" tone="secondary">
              {result.explanation}
            </AppText>
          </Card>
        );
      })}

      {/* 두 버튼은 같지만 순서가 다르다. 떨어졌으면 다시 푸는 것이, 붙었으면 나가는 것이 다음 할 일이다. */}
      <View style={styles.actions}>
        <AppButton
          title={attempt.passed ? '교육 목록으로' : '다시 풀기'}
          style={styles.action}
          onPress={attempt.passed ? onDone : onRetry}
        />
        <AppButton
          title={attempt.passed ? '다시 풀기' : '교육 목록으로'}
          variant="outline"
          style={styles.action}
          onPress={attempt.passed ? onRetry : onDone}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  action: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
});
