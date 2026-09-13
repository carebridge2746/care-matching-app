/// <reference types="node" />
// 이 테스트만 저장소 파일을 직접 읽는다. Node 타입은 앱 전체가 아니라 이 파일에만 연다.
import { readFileSync } from 'fs';
import path from 'path';

import { DemoTrainingCourses } from '@/api/training.demo';

/**
 * 교육 문항은 두 곳에 있다 — Supabase 시드(schema.sql)와 Mock 사본(training.demo.ts).
 * 한쪽만 고치면 모드마다 채점이 달라지므로, 글자까지 같은지 확인한다.
 */

type SqlQuestion = {
  id: string;
  courseId: string;
  order: number;
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
};

const unquote = (value: string) => value.replace(/''/g, "'");

function readSqlQuestions(): SqlQuestion[] {
  const sql = readFileSync(path.join(__dirname, '..', 'supabase', 'schema.sql'), 'utf8');
  const block = sql.split('insert into public.training_quiz_questions')[1] ?? '';

  // ('<id>', '<course>', <n>, '<질문>', array[ '<보기>', ... ], <정답>, '<해설>')
  const tuple =
    /\(\s*'([0-9a-f-]{36})',\s*'([0-9a-f-]{36})',\s*(\d+),\s*'((?:[^']|'')*)',\s*array\[([\s\S]*?)\],\s*(\d+),\s*'((?:[^']|'')*)'\s*\)/g;

  return [...block.matchAll(tuple)].map((match) => ({
    id: match[1] ?? '',
    courseId: match[2] ?? '',
    order: Number(match[3]),
    question: unquote(match[4] ?? ''),
    choices: [...(match[5] ?? '').matchAll(/'((?:[^']|'')*)'/g)].map((choice) => unquote(choice[1] ?? '')),
    answerIndex: Number(match[6]),
    explanation: unquote(match[7] ?? ''),
  }));
}

describe('교육 문항 시드', () => {
  const sqlQuestions = readSqlQuestions();
  const demoQuestions = DemoTrainingCourses.flatMap((course) =>
    course.questions.map((question) => ({
      id: question.id,
      courseId: course.id,
      order: question.order,
      question: question.question,
      choices: question.choices,
      answerIndex: question.answerIndex,
      explanation: question.explanation,
    }))
  );

  it('SQL 과 Mock 의 문항 수가 같다', () => {
    expect(sqlQuestions.length).toBeGreaterThan(0);
    expect(sqlQuestions).toHaveLength(demoQuestions.length);
  });

  it('문항마다 과정·순서·질문·보기·정답·해설이 글자까지 같다', () => {
    const byId = new Map(sqlQuestions.map((question) => [question.id, question]));

    for (const expected of demoQuestions) {
      expect(byId.get(expected.id)).toEqual(expected);
    }
  });
});
