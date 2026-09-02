/**
 * AI 가 돌려줄 구조화 결과의 모양.
 *
 * 이 스키마는 두 가지 일을 한다.
 *   1) Claude 의 structured outputs(`output_config.format`) 에 그대로 넘겨서
 *      응답이 반드시 이 형태의 JSON 이 되도록 강제한다.
 *   2) `care_requests.ai_conditions` 에 저장되는 값의 계약이 된다.
 *
 * 사람이 고른 조건(care_requests 의 컬럼들)과 AI 가 뽑은 조건을 섞지 않는다.
 * AI 는 보호자가 적은 원문만 보고, 폼에서 고른 값은 건드리지 않는다 —
 * 두 값이 다를 때 무엇이 사람의 선택이었는지 되짚을 수 있어야 하기 때문이다.
 *
 * 목록 값(역량·요일 등)은 자유 문자열이 아니라 enum 으로 못박는다.
 * '체위변경' 과 '체위 변경' 처럼 갈리면 매칭에서 같은 조건으로 볼 수 없다.
 */

/**
 * 앱의 `src/lib/care-options.ts` 와 **같은 목록이어야 한다.**
 * Edge Function 은 앱 번들과 따로 배포되므로 import 할 수 없어 여기에 한 벌 더 둔다.
 * 항목을 늘릴 때는 두 파일을 함께 고친다.
 */
export const CareSkills = [
  '식사 보조',
  '체위 변경',
  '기저귀 교체',
  '목욕·위생',
  '투약 관리',
  '재활 보조',
  '흡인(석션)',
  '산소 요법',
  '말벗·정서 지원',
  '병원 동행',
] as const;

export const Weekdays = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/**
 * 값이 없을 때 null 대신 'unknown' 을 쓰는 자리가 있다.
 * enum 안에 null 을 섞으면 스키마가 읽기 어려워지고, 모델도 "고르지 않음"을
 * 하나의 선택지로 볼 때 더 안정적으로 답한다.
 */
export const AiConditionsSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'location',
    'care_place',
    'care_type',
    'required_skills',
    'schedule',
    'gender_preference',
    'budget_per_day',
    'additional_notes',
    'confidence',
  ],
  properties: {
    location: {
      type: ['string', 'null'],
      description: '간병이 이뤄질 지역. 시군구 단위로 정규화한다 (예: "서울 강남구"). 원문에 없으면 null.',
    },
    care_place: {
      type: 'string',
      enum: ['hospital', 'home', 'facility', 'unknown'],
      description: '간병 장소. 병원 / 자택(재가) / 요양시설. 판단할 근거가 없으면 unknown.',
    },
    care_type: {
      type: 'array',
      items: { type: 'string' },
      description:
        '환자 상태와 필요한 간병의 종류를 짧은 명사구로 (예: "치매", "거동 불편", "야간 간병"). 원문에 없으면 빈 배열.',
    },
    required_skills: {
      type: 'array',
      items: { type: 'string', enum: CareSkills },
      description: '원문에서 분명히 드러난 간병 역량만. 목록에 없는 값은 넣지 않는다.',
    },
    schedule: {
      type: 'object',
      additionalProperties: false,
      required: ['start_date', 'end_date', 'daily_start_time', 'daily_end_time', 'weekdays', 'note'],
      properties: {
        start_date: { type: ['string', 'null'], description: 'YYYY-MM-DD. 상대 표현은 오늘 날짜 기준으로 계산한다.' },
        end_date: { type: ['string', 'null'], description: 'YYYY-MM-DD. 종료일이 정해지지 않았으면 null.' },
        daily_start_time: { type: ['string', 'null'], description: 'HH:MM (24시간).' },
        daily_end_time: {
          type: ['string', 'null'],
          description: 'HH:MM (24시간). 야간 간병이면 시작보다 이를 수 있다.',
        },
        weekdays: {
          type: 'array',
          items: { type: 'string', enum: Weekdays },
          description: '특정 요일만 필요한 경우. 매일이거나 언급이 없으면 빈 배열.',
        },
        note: {
          type: ['string', 'null'],
          description: '날짜로 옮기기 어려운 일정 표현 그대로 (예: "퇴원할 때까지", "주 3회").',
        },
      },
    },
    gender_preference: {
      type: 'string',
      enum: ['male', 'female', 'any'],
      description: '간병인 성별 선호. 원문에 없으면 any.',
    },
    budget_per_day: {
      type: ['integer', 'null'],
      description: '하루 기준 예산(원). "15만원" 은 150000. 월 단위 등 하루로 환산할 수 없으면 null.',
    },
    additional_notes: {
      type: ['string', 'null'],
      description:
        '위 항목에 담기지 않은 특이사항을 한두 문장으로. 이름·연락처·주소 같은 개인 식별 정보는 넣지 않는다.',
    },
    confidence: {
      type: 'string',
      enum: ['high', 'medium', 'low'],
      description: '원문이 얼마나 분명했는지. 대부분을 추측해야 했다면 low.',
    },
  },
} as const;

export type AiSchedule = {
  start_date: string | null;
  end_date: string | null;
  daily_start_time: string | null;
  daily_end_time: string | null;
  weekdays: string[];
  note: string | null;
};

export type AiConditions = {
  location: string | null;
  care_place: 'hospital' | 'home' | 'facility' | 'unknown';
  care_type: string[];
  required_skills: string[];
  schedule: AiSchedule;
  gender_preference: 'male' | 'female' | 'any';
  budget_per_day: number | null;
  additional_notes: string | null;
  confidence: 'high' | 'medium' | 'low';
};

/**
 * 모델이 돌려준 값을 한 번 더 거른다.
 *
 * structured outputs 가 형태는 보장하지만, 저장되는 값이므로 목록 밖의 역량이나
 * 형식이 어긋난 날짜까지 그대로 두지는 않는다. 틀린 항목은 버리고 나머지는 살린다 —
 * 한 칸 때문에 구조화 전체를 실패로 만들면 보호자만 손해다.
 */
export function sanitize(value: AiConditions): AiConditions {
  const isDate = (text: string | null) => (text && /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null);
  const isTime = (text: string | null) =>
    text && /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : null;
  const trimmed = (text: string | null) => {
    const value = text?.trim();
    return value ? value : null;
  };

  return {
    location: trimmed(value.location),
    care_place: value.care_place,
    care_type: value.care_type.map((item) => item.trim()).filter(Boolean).slice(0, 10),
    required_skills: value.required_skills.filter((skill) =>
      (CareSkills as readonly string[]).includes(skill)
    ),
    schedule: {
      start_date: isDate(value.schedule.start_date),
      end_date: isDate(value.schedule.end_date),
      daily_start_time: isTime(value.schedule.daily_start_time),
      daily_end_time: isTime(value.schedule.daily_end_time),
      weekdays: value.schedule.weekdays.filter((day) =>
        (Weekdays as readonly string[]).includes(day)
      ),
      note: trimmed(value.schedule.note),
    },
    gender_preference: value.gender_preference,
    // 음수나 터무니없이 큰 값은 잘못 읽은 것이다
    budget_per_day:
      value.budget_per_day !== null && value.budget_per_day > 0 && value.budget_per_day < 10_000_000
        ? Math.round(value.budget_per_day)
        : null,
    additional_notes: trimmed(value.additional_notes),
    confidence: value.confidence,
  };
}
