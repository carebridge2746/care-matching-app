import type { LlmAdapter } from '@/api/llm.types';
import { delay } from '@/api/mock-store';
import { CommonCareSkills } from '@/lib/care-options';
import { addDays } from '@/lib/date';
import type { AiCarePlace, CaregiverGenderPreference, Weekday } from '@/types';

/**
 * 로컬 Mock AI 어댑터.
 *
 * LLM 을 부르지 않고 키워드로만 원문을 훑는다. 목적은 "그럴듯한 답"이 아니라
 * Supabase Edge Function 없이도 화면 흐름 — 정리 결과가 요청에 붙어 저장되고,
 * 상세 화면에 보이고, 실패해도 요청 등록은 막히지 않는 것 — 을 그대로 확인하는 것이다.
 *
 * 그래서 실제 LLM 과 달리 문맥을 읽지 못한다. 원문에 없는 값은 비워 두는 규칙만 같게 지킨다.
 */

/** '서울 강남구', '분당구' 처럼 시군구로 끝나는 첫 덩어리 */
const RegionPattern = /([가-힣]{2,10}\s?)?[가-힣]{1,6}(시|군|구)(?![가-힣])/;

/** '15만원', '150,000원', '하루 12만' */
const BudgetPattern = /(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(만\s*원|만|원)/;

/** '오전 9시', '9시부터', '21:00' */
const TimePattern = /(\d{1,2})\s*(?::(\d{2})|시)/g;

const PlaceKeywords: { place: AiCarePlace; words: string[] }[] = [
  { place: 'hospital', words: ['병원', '입원', '병실', '수술'] },
  { place: 'facility', words: ['요양원', '시설', '요양병원'] },
  { place: 'home', words: ['집', '자택', '재가', '댁'] },
];

const WeekdayKeywords: { weekday: Weekday; words: string[] }[] = [
  { weekday: 'mon', words: ['월요일', '월'] },
  { weekday: 'tue', words: ['화요일', '화'] },
  { weekday: 'wed', words: ['수요일', '수'] },
  { weekday: 'thu', words: ['목요일', '목'] },
  { weekday: 'fri', words: ['금요일', '금'] },
  { weekday: 'sat', words: ['토요일', '토'] },
  { weekday: 'sun', words: ['일요일', '일'] },
];

/** 역량 목록의 값과 원문을 잇는 말. 목록에 있는 표현 그대로 적지 않는 경우가 더 많다. */
const SkillKeywords: Record<(typeof CommonCareSkills)[number], string[]> = {
  '식사 보조': ['식사', '밥', '끼니', '먹여'],
  '체위 변경': ['체위', '돌려 눕', '자세'],
  '기저귀 교체': ['기저귀', '배변', '대소변'],
  '목욕·위생': ['목욕', '세면', '씻'],
  '투약 관리': ['약', '투약', '복용'],
  '재활 보조': ['재활', '물리치료', '운동'],
  '흡인(석션)': ['석션', '흡인', '가래'],
  '산소 요법': ['산소', '호흡기'],
  '말벗·정서 지원': ['말벗', '대화', '외로'],
  '병원 동행': ['동행', '외래', '진료 같이', '모시고'],
};

function findPlace(text: string): AiCarePlace {
  return PlaceKeywords.find(({ words }) => words.some((word) => text.includes(word)))?.place ?? 'unknown';
}

function findGender(text: string): CaregiverGenderPreference {
  if (/여자|여성/.test(text)) {
    return 'female';
  }
  if (/남자|남성/.test(text)) {
    return 'male';
  }
  return 'any';
}

function findBudget(text: string): number | undefined {
  const match = BudgetPattern.exec(text);
  if (!match) {
    return undefined;
  }

  const amount = Number(match[1]?.replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) {
    return undefined;
  }

  // '만원'/'만' 은 만 단위, 그 외에는 적힌 그대로 원 단위로 본다
  const value = match[2]?.startsWith('만') ? amount * 10_000 : amount;
  return value < 10_000_000 ? Math.round(value) : undefined;
}

/** '오전 9시부터 오후 6시' → 09:00 / 18:00. 두 번째 시각까지만 본다. */
function findTimes(text: string): { start?: string; end?: string } {
  const found: string[] = [];
  let match: RegExpExecArray | null;

  TimePattern.lastIndex = 0;
  while ((match = TimePattern.exec(text)) !== null && found.length < 2) {
    let hour = Number(match[1]);
    const minute = match[2] ?? '00';

    if (!Number.isFinite(hour) || hour > 24) {
      continue;
    }
    // '오후 6시' 처럼 앞에 오후가 붙으면 12를 더한다
    const before = text.slice(Math.max(0, match.index - 3), match.index);
    if (/오후|저녁|밤/.test(before) && hour < 12) {
      hour += 12;
    }
    found.push(`${String(hour % 24).padStart(2, '0')}:${minute}`);
  }

  return { ...(found[0] ? { start: found[0] } : {}), ...(found[1] ? { end: found[1] } : {}) };
}

/** '내일', '모레', '다음 주' 만 푼다. 그 외 표현은 note 로 남긴다. */
function findStartDate(text: string, today: string): string | undefined {
  if (text.includes('모레')) {
    return addDays(today, 2);
  }
  if (text.includes('내일')) {
    return addDays(today, 1);
  }
  if (text.includes('다음 주') || text.includes('다음주')) {
    return addDays(today, 7);
  }
  if (text.includes('오늘') || text.includes('당장') || text.includes('바로')) {
    return today;
  }
  return undefined;
}

export const mockLlmAdapter: LlmAdapter = {
  async structureCareRequest(rawText, today) {
    // 실제 호출은 몇 초가 걸린다. 화면의 '정리하는 중' 표시를 확인하려면 지연이 있어야 한다.
    await delay(800);

    const text = rawText.trim();
    const region = RegionPattern.exec(text)?.[0]?.trim();
    const times = findTimes(text);
    const startDate = findStartDate(text, today);
    const budget = findBudget(text);

    const skills = (Object.keys(SkillKeywords) as (typeof CommonCareSkills)[number][]).filter(
      (skill) => SkillKeywords[skill].some((word) => text.includes(word))
    );

    const weekdays = WeekdayKeywords.filter(({ words }) =>
      // 한 글자 약칭('월')은 '월요일' 로 적힌 경우에만 센다. '이번 달' 의 '달' 과 섞이지 않게 한다.
      words.some((word) => word.length > 1 && text.includes(word))
    ).map(({ weekday }) => weekday);

    return {
      ...(region ? { location: region } : {}),
      carePlace: findPlace(text),
      // 문맥을 읽지 못하므로 환자 상태는 추측하지 않는다. 실제 LLM 이 채우는 자리다.
      careType: [],
      requiredSkills: skills,
      schedule: {
        ...(startDate ? { startDate } : {}),
        ...(times.start ? { dailyStartTime: times.start } : {}),
        ...(times.end ? { dailyEndTime: times.end } : {}),
        weekdays,
        ...(text.includes('퇴원') ? { note: '퇴원할 때까지' } : {}),
      },
      genderPreference: findGender(text),
      ...(budget !== undefined ? { budgetPerDay: budget } : {}),
      // Mock 은 문장을 요약하지 못한다. 요약이 필요한 자리는 비워 둔다.
      confidence: 'low',
    };
  },
};
