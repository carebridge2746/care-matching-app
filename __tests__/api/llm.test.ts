import { mockLlmAdapter as llm } from '@/api/llm.mock';

const Today = '2026-09-13';

describe('Mock AI 요청 정리', () => {
  it('원문에 적힌 조건을 뽑는다', async () => {
    const result = await llm.structureCareRequest(
      '서울 강남구 병원에 입원하신 어머니, 내일부터 오전 9시부터 오후 6시까지 여성 간병인 구합니다. 하루 15만원, 식사 도와주시고 기저귀 갈아주실 분',
      Today
    );

    expect(result).toMatchObject({
      location: '서울 강남구',
      carePlace: 'hospital',
      requiredSkills: ['식사 보조', '기저귀 교체'],
      schedule: { startDate: '2026-09-14', dailyStartTime: '09:00', dailyEndTime: '18:00', weekdays: [] },
      genderPreference: 'female',
      budgetPerDay: 150000,
      confidence: 'low',
    });
  });

  it('원문에 없는 값은 추측하지 않고 비워 둔다', async () => {
    const result = await llm.structureCareRequest('어르신 돌봐주실 분 찾습니다', Today);

    expect(result).toEqual({
      carePlace: 'unknown',
      careType: [],
      requiredSkills: [],
      schedule: { weekdays: [] },
      genderPreference: 'any',
      confidence: 'low',
    });
  });

  it('요일은 "월요일"처럼 적힌 것만 센다 — "이번 달"의 "달"과 섞이지 않는다', async () => {
    const result = await llm.structureCareRequest('모레부터 월요일 수요일 금요일에 집으로 와 주세요', Today);

    expect(result.carePlace).toBe('home');
    expect(result.schedule).toMatchObject({ startDate: '2026-09-15', weekdays: ['mon', 'wed', 'fri'] });
  });

  it.each([
    ['일당 120,000원', 120000],
    ['하루 12만', 120000],
    ['예산 1억원', undefined],
  ])('%s → %s', async (text, expected) => {
    expect((await llm.structureCareRequest(text, Today)).budgetPerDay).toBe(expected);
  });
});
