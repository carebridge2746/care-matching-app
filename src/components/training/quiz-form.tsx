import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { ChoiceGroup, type ChoiceOption } from '@/components/common/choice-group';
import { Spacing } from '@/theme';
import type { QuizAnswer, QuizQuestion, TrainingCourse } from '@/types';

export type QuizFormProps = {
  course: TrainingCourse;
  questions: QuizQuestion[];
  busy?: boolean;
  onSubmit: (answers: QuizAnswer[]) => void;
  onCancel: () => void;
};

/** 보기 번호는 1부터다. ChoiceGroup 은 문자열 값을 쓰므로 낼 때 숫자로 되돌린다. */
function toOptions(choices: string[]): ChoiceOption<string>[] {
  return choices.map((choice, index) => ({ value: String(index + 1), label: choice }));
}

/**
 * 퀴즈.
 *
 * 문항을 한 화면에 모두 펼친다. 한 문항씩 넘기면 앞 문항을 고쳐 볼 수 없고,
 * 몇 개나 남았는지도 보이지 않아 중간에 그만두는 사람이 늘어난다.
 *
 * 다 고르기 전에는 제출 버튼을 누를 수 없다. 빈 문항은 틀린 것으로 채점되는데,
 * 잘못 눌러서 떨어지는 일은 막을 수 있으면 막는 편이 낫다.
 * 그럼에도 빈 문항이 오면 저장소가 틀린 것으로 센다 — 화면의 잠금은 안내이지 판정이 아니다.
 */
export function QuizForm({ course, questions, busy = false, onSubmit, onCancel }: QuizFormProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const answeredCount = questions.filter((question) => answers[question.id]).length;
  const remaining = questions.length - answeredCount;
  const canSubmit = remaining === 0 && !busy;

  return (
    <View style={styles.container}>
      <Card>
        <AppText variant="heading">{course.title} 퀴즈</AppText>
        <AppText variant="body" tone="secondary">
          {course.questionCount}문항 중 {course.passScore}점 이상이면 수료합니다. 몇 번이든 다시
          풀 수 있고, 틀린 문항은 낸 뒤에 해설과 함께 보여 드립니다.
        </AppText>
      </Card>

      {questions.map((question) => (
        <Card key={question.id}>
          <ChoiceGroup
            label={`${question.order}. ${question.question}`}
            options={toOptions(question.choices)}
            value={answers[question.id] ?? null}
            onChange={(value) =>
              setAnswers((previous) => ({ ...previous, [question.id]: value }))
            }
          />
        </Card>
      ))}

      <AppText variant="caption" tone={remaining > 0 ? 'secondary' : 'success'} center>
        {remaining > 0
          ? `${questions.length}문항 중 ${answeredCount}문항 고르셨습니다. ${remaining}문항 남았습니다.`
          : '모두 고르셨습니다. 제출하면 바로 채점됩니다.'}
      </AppText>

      <View style={styles.actions}>
        <AppButton
          title="답안 제출"
          style={styles.action}
          loading={busy}
          disabled={!canSubmit}
          onPress={() =>
            onSubmit(
              questions
                .filter((question) => answers[question.id])
                .map((question) => ({
                  questionId: question.id,
                  choiceIndex: Number(answers[question.id]),
                }))
            )
          }
        />
        <AppButton
          title="그만두기"
          variant="outline"
          style={styles.action}
          disabled={busy}
          onPress={onCancel}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
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
