import { particle } from '@/lib/korean';
import type { AiCareConditions, CaregiverGenderPreference, CareType } from '@/types';

/** 간병 요청 작성 폼이 들고 있는 값. 입력칸 그대로라 숫자도 문자열이다. */
export type CareRequestDraft = {
  careType: CareType | null;
  region: string;
  startDate: string;
  endDate: string;
  dailyStartTime: string;
  dailyEndTime: string;
  requiredSkills: string[];
  preferredGender: CaregiverGenderPreference;
  budget: string;
};

export type AiFillResult = {
  draft: CareRequestDraft;
  /** 채운 칸의 이름. 화면이 "무엇을 채웠는지"를 그대로 말해 준다. */
  filledLabels: string[];
};

/**
 * AI 가 원문에서 읽어 낸 조건으로 요청 폼의 **빈 칸만** 채운다.
 *
 * 보호자가 이미 고르거나 적은 값은 건드리지 않는다. 사람이 정한 값이 매칭의 기준이고
 * (AiCareConditions 주석 참고), AI 가 덮어쓰면 보호자는 자기가 고친 값이 왜 바뀌었는지 모른다.
 *
 * 시작일은 오늘로 미리 채워져 있어서 "비었는지"로 가릴 수 없다. 그래서 보호자가 손댔는지를
 * 따로 받는다. 성별 선호도 '상관 없음'이 기본값이라 그 값일 때만 바꾼다.
 */
export function fillDraftFromAi(
  draft: CareRequestDraft,
  ai: AiCareConditions,
  options: { startDateTouched: boolean }
): AiFillResult {
  const next = { ...draft };
  const filledLabels: string[] = [];

  if (next.careType === null && ai.carePlace !== 'unknown') {
    next.careType = ai.carePlace;
    filledLabels.push('간병 장소');
  }
  if (!next.region.trim() && ai.location) {
    next.region = ai.location;
    filledLabels.push('지역');
  }
  if (!options.startDateTouched && ai.schedule.startDate) {
    next.startDate = ai.schedule.startDate;
    filledLabels.push('시작일');
  }
  if (!next.endDate.trim() && ai.schedule.endDate) {
    next.endDate = ai.schedule.endDate;
    filledLabels.push('종료일');
  }
  if (!next.dailyStartTime.trim() && ai.schedule.dailyStartTime) {
    next.dailyStartTime = ai.schedule.dailyStartTime;
    filledLabels.push('시작 시각');
  }
  if (!next.dailyEndTime.trim() && ai.schedule.dailyEndTime) {
    next.dailyEndTime = ai.schedule.dailyEndTime;
    filledLabels.push('종료 시각');
  }
  if (next.requiredSkills.length === 0 && ai.requiredSkills.length > 0) {
    next.requiredSkills = ai.requiredSkills;
    filledLabels.push('필요한 간병 역량');
  }
  if (next.preferredGender === 'any' && ai.genderPreference !== 'any') {
    next.preferredGender = ai.genderPreference;
    filledLabels.push('간병인 성별');
  }
  if (!next.budget.trim() && ai.budgetPerDay !== undefined) {
    next.budget = String(ai.budgetPerDay);
    filledLabels.push('일당 예산');
  }

  return { draft: next, filledLabels };
}

/** 채운 결과를 보호자에게 알리는 한 문장 */
export function describeAiFill(filledLabels: string[]): string {
  const last = filledLabels[filledLabels.length - 1];

  if (!last) {
    return '비어 있는 칸에 채울 내용을 원문에서 찾지 못했습니다. 아래 조건을 직접 확인해 주세요.';
  }

  return `${filledLabels.join(', ')}${particle(last, '을', '를')} 채웠습니다. 맞는지 확인해 주세요.`;
}
