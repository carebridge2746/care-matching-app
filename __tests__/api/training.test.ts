import { DemoTrainingCourses } from '@/api/training.demo';
import { mockTrainingAdapter as training } from '@/api/training.mock';
import type { QuizAnswer } from '@/types';

import { Caregiver, NewCaregiver } from '../../test-utils/fixtures';

type SeedCourse = (typeof DemoTrainingCourses)[number];

/** 앞에서부터 correctCount 개만 정답을 고르고, 나머지는 일부러 틀린 보기를 고른다 */
function answersFor(course: SeedCourse, correctCount: number): QuizAnswer[] {
  return course.questions.map((question, index) => ({
    questionId: question.id,
    choiceIndex:
      index < correctCount ? question.answerIndex : (question.answerIndex % question.choices.length) + 1,
  }));
}

const [dementia, , safety] = DemoTrainingCourses as [SeedCourse, SeedCourse, SeedCourse];

describe('교육 과정 (Phase 9)', () => {
  it('목록에는 교육 내용이, 문항에는 정답과 해설이 담기지 않는다', async () => {
    const courses = await training.listCourses();
    expect(courses).toHaveLength(DemoTrainingCourses.length);
    expect(courses[0]).not.toHaveProperty('lessons');
    expect(courses.map((course) => course.questionCount)).toEqual(
      DemoTrainingCourses.map((course) => course.questions.length)
    );

    const [question] = await training.listQuestions(dementia.id);
    expect(question).not.toHaveProperty('answerIndex');
    expect(question).not.toHaveProperty('explanation');
  });

  it('없는 과정은 not_found', async () => {
    await expect(training.submitQuiz('course-nope', Caregiver, [])).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('퀴즈 채점 (Phase 9)', () => {
  // 아래 점수는 문항 5개를 전제로 한다
  it('시연 과정은 5문항이고 합격선이 80점·70점이다', () => {
    expect(dementia.questions).toHaveLength(5);
    expect(dementia.passScore).toBe(80);
    expect(safety.passScore).toBe(70);
  });

  it('합격선에 못 미치면 수료가 생기지 않고, 맞은 문항에도 해설이 온다', async () => {
    const grade = await training.submitQuiz(dementia.id, Caregiver, answersFor(dementia, 3));

    expect(grade.attempt).toMatchObject({ score: 60, correctCount: 3, questionCount: 5, passed: false });
    expect(grade.isNewCompletion).toBe(false);
    expect(grade.results.filter((result) => result.isCorrect)).toHaveLength(3);
    expect(grade.results.every((result) => typeof result.explanation === 'string')).toBe(true);
  });

  it('고르지 않은 문항은 틀린 것으로 세고 분모는 그대로다', async () => {
    const grade = await training.submitQuiz(dementia.id, Caregiver, answersFor(dementia, 5).slice(0, 2));

    expect(grade.attempt).toMatchObject({ score: 40, questionCount: 5 });
    expect(grade.results[4]).not.toHaveProperty('selectedIndex');
  });

  it('처음 합격한 날이 수료일이고, 다시 풀어 더 높은 점수를 받아도 밀리지 않는다', async () => {
    const passed = await training.submitQuiz(dementia.id, Caregiver, answersFor(dementia, 4));
    expect(passed.attempt).toMatchObject({ score: 80, passed: true });
    expect(passed.isNewCompletion).toBe(true);

    const again = await training.submitQuiz(dementia.id, Caregiver, answersFor(dementia, 5));
    expect(again.attempt.score).toBe(100);
    expect(again.isNewCompletion).toBe(false);
    expect(again.completedAt).toBe(passed.completedAt);

    expect(await training.listCompletions(Caregiver)).toHaveLength(1);
    const attempts = await training.listAttempts(Caregiver);
    expect(attempts).toHaveLength(2);
    expect(attempts.map((attempt) => attempt.score).sort()).toEqual([100, 80]);
  });

  it('합격선은 과정마다 다르다', async () => {
    expect((await training.submitQuiz(safety.id, Caregiver, answersFor(safety, 3))).attempt.passed).toBe(false);
    expect((await training.submitQuiz(safety.id, Caregiver, answersFor(safety, 4))).attempt.passed).toBe(true);
  });

  it('남의 응시와 수료는 섞이지 않는다', async () => {
    await training.submitQuiz(dementia.id, Caregiver, answersFor(dementia, 5));

    expect(await training.listAttempts(NewCaregiver)).toHaveLength(0);
    expect(await training.listCompletions(NewCaregiver)).toHaveLength(0);
  });
});
