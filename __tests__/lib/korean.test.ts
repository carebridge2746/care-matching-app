import { describeAiFill, fillDraftFromAi, type CareRequestDraft } from '@/lib/ai-fill';
import { particle } from '@/lib/korean';
import type { AiCareConditions } from '@/types';

describe('조사 고르기', () => {
  it.each([
    ['이름', '을'],
    ['주소', '를'],
    ['시작일', '을'],
    ['간병 장소', '를'],
    ['  지역  ', '을'],
  ])('%j 뒤에는 %s', (word, expected) => {
    expect(particle(word, '을', '를')).toBe(expected);
  });

  it('끝 글자가 한글이 아니면 받침을 알 수 없어 둘을 함께 적는다', () => {
    expect(particle('ID', '은', '는')).toBe('은(는)');
    expect(particle('', '을', '를')).toBe('을(를)');
  });
});

describe('AI 결과로 요청 폼 채우기', () => {
  const empty: CareRequestDraft = {
    careType: null,
    region: '',
    startDate: '2026-09-13',
    endDate: '',
    dailyStartTime: '',
    dailyEndTime: '',
    requiredSkills: [],
    preferredGender: 'any',
    budget: '',
  };

  const ai: AiCareConditions = {
    location: '서울 강남구',
    carePlace: 'hospital',
    careType: [],
    requiredSkills: ['식사 보조', '기저귀 교체'],
    schedule: { startDate: '2026-09-14', dailyStartTime: '09:00', dailyEndTime: '18:00', weekdays: [] },
    genderPreference: 'female',
    budgetPerDay: 150000,
    confidence: 'low',
  };

  it('빈 칸을 모두 채우고 무엇을 채웠는지 알려 준다', () => {
    const { draft, filledLabels } = fillDraftFromAi(empty, ai, { startDateTouched: false });

    expect(draft).toEqual({
      careType: 'hospital',
      region: '서울 강남구',
      startDate: '2026-09-14',
      endDate: '',
      dailyStartTime: '09:00',
      dailyEndTime: '18:00',
      requiredSkills: ['식사 보조', '기저귀 교체'],
      preferredGender: 'female',
      budget: '150000',
    });
    expect(filledLabels).toEqual([
      '간병 장소',
      '지역',
      '시작일',
      '시작 시각',
      '종료 시각',
      '필요한 간병 역량',
      '간병인 성별',
      '일당 예산',
    ]);
  });

  it('보호자가 이미 고르거나 적은 값은 덮어쓰지 않는다', () => {
    const filled: CareRequestDraft = {
      ...empty,
      careType: 'home',
      region: '서울 송파구',
      startDate: '2026-09-20',
      requiredSkills: ['말벗·정서 지원'],
      preferredGender: 'male',
      budget: '120000',
    };

    const { draft, filledLabels } = fillDraftFromAi(filled, ai, { startDateTouched: true });

    expect(draft).toMatchObject({
      careType: 'home',
      region: '서울 송파구',
      startDate: '2026-09-20',
      requiredSkills: ['말벗·정서 지원'],
      preferredGender: 'male',
      budget: '120000',
    });
    expect(filledLabels).toEqual(['시작 시각', '종료 시각']);
  });

  it('장소를 알 수 없거나 성별이 상관없음이면 그 칸은 그대로 둔다', () => {
    const vague: AiCareConditions = {
      carePlace: 'unknown',
      careType: [],
      requiredSkills: [],
      schedule: { weekdays: [] },
      genderPreference: 'any',
      confidence: 'low',
    };

    const { draft, filledLabels } = fillDraftFromAi(empty, vague, { startDateTouched: false });

    expect(draft).toEqual(empty);
    expect(filledLabels).toEqual([]);
  });

  it('안내 문장은 마지막 칸 이름에 맞춰 조사를 붙인다', () => {
    expect(describeAiFill(['지역', '간병 장소'])).toBe('지역, 간병 장소를 채웠습니다. 맞는지 확인해 주세요.');
    expect(describeAiFill(['간병 장소', '지역'])).toBe('간병 장소, 지역을 채웠습니다. 맞는지 확인해 주세요.');
    expect(describeAiFill([])).toContain('찾지 못했습니다');
  });
});
