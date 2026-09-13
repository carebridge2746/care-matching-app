import { hasSlot, slotsForTimeRange, slotsForWeekday, weekdaysInPeriod } from '@/lib/availability';
import {
  CaregiverGenderPreferenceLabels,
  CareTypeLabels,
  type AvailabilitySlot,
  type CareRequest,
  type CaregiverProfile,
  type MatchResult,
  type MatchScoreItem,
  type TrainingCompletion,
  type TrainingCourse,
} from '@/types';

/**
 * 간병 요청과 간병인을 맞춰 보는 점수 계산.
 *
 * 이 파일이 매칭 규칙의 유일한 구현이다. Mock 모드와 Supabase 모드가 같은 함수를 쓰고,
 * 보호자 화면(누구를 추천할까)과 간병인 화면(어떤 요청이 나에게 맞을까)도 같은 함수를 쓴다.
 * 규칙이 두 군데 있으면 "나는 87점으로 보이는데 상대에겐 아니다" 같은 어긋남이 생긴다.
 *
 * 사람을 고르는 일은 AI가 하지 않는다. AI는 자연어를 조건으로 바꾸는 데까지만 관여하고,
 * 그렇게 나온 조건으로 여기서 정해진 계산을 한다. 같은 입력이면 언제나 같은 순위가 나오고,
 * 왜 그 사람이 위에 있는지를 항목별 점수(MatchScoreItem)로 그대로 보여 줄 수 있다.
 */

/**
 * 항목별 배점. 합이 100이 되도록 맞춘다.
 *
 * 교육 수료는 작게 둔다. 크게 두면 교육을 아직 못 들은 새 간병인이 계속 아래로 밀려 첫 매칭을
 * 잡지 못한다. 대신 본인이 적는 자격(certification)보다는 조금 더 쳐 준다 — 수료는 앱이 채점해서
 * 확인한 기록이고, 자격은 본인이 신고한 값이다. 경력과 자격에서 조금씩 떼어 와 합을 맞췄다.
 */
export const MatchWeights = {
  region: 25,
  skills: 25,
  availability: 20,
  budget: 15,
  experience: 7,
  certification: 3,
  training: 5,
} as const;

/** 경력을 만점으로 치는 기준 년수. 그 이상은 더 벌어지지 않는다. */
const ExperienceCap = 5;

/** 앱 교육을 이만큼 수료하면 만점. 과정이 늘어나도 수료 개수로 크게 벌어지지 않게 둔다. */
const TrainingCap = 2;

/** 추천 목록에 올릴 최소 점수. 이보다 낮으면 굳이 보여 주지 않는다. */
export const RecommendationThreshold = 40;

/** 간병인 화면에서 '잘 맞는 요청'으로 강조하는 기준 */
export const GoodMatchThreshold = 70;

/** 점수 계산에 필요한 요청 조건만. CareRequest 와 CaregiverCareRequest 둘 다 이 모양을 만족한다. */
export type MatchRequestConditions = Pick<
  CareRequest,
  | 'careType'
  | 'region'
  | 'requiredSkills'
  | 'preferredCaregiverGender'
  | 'budgetPerDay'
  | 'startDate'
  | 'endDate'
  | 'dailyStartTime'
  | 'dailyEndTime'
>;

/**
 * 점수 계산에 필요한 간병인 조건만. CaregiverCandidate 는 그대로 만족하고,
 * 간병인 본인 화면은 CaregiverProfile 에 수료한 교육(completedTrainingTitles)을 붙여 넘긴다 —
 * 빠뜨리면 보호자에게 보이는 점수와 본인에게 보이는 점수가 달라진다.
 */
export type MatchCaregiverConditions = Pick<
  CaregiverProfile,
  | 'gender'
  | 'yearsOfExperience'
  | 'certifications'
  | 'skills'
  | 'careTypes'
  | 'regions'
  | 'minDailyWage'
  | 'availability'
> & {
  /** 앱에서 수료한 교육 이름. 본인이 적은 자격(certifications)과 따로 센다. */
  completedTrainings: string[];
};

/** '서울  강남구' 와 '서울 강남구' 를 같은 지역으로 본다 */
function normalizeRegion(region: string): string {
  return region.trim().replace(/\s+/g, ' ');
}

/** '서울 강남구' → '서울'. 같은 시/도면 아주 멀지는 않다고 본다. */
function wideRegion(region: string): string {
  return normalizeRegion(region).split(' ')[0] ?? '';
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function scoreRegion(caregiver: MatchCaregiverConditions, region: string): MatchScoreItem {
  const max = MatchWeights.region;
  const target = normalizeRegion(region);
  const regions = caregiver.regions.map(normalizeRegion);

  if (regions.includes(target)) {
    return { label: '지역', score: max, max, detail: `${target} 근무 가능` };
  }

  const nearby = regions.find((item) => wideRegion(item) === wideRegion(target));
  if (nearby) {
    return {
      label: '지역',
      score: round(max * 0.6),
      max,
      detail: `${nearby} 근무 — 같은 ${wideRegion(target)} 안이지만 지역이 다름`,
    };
  }

  return {
    label: '지역',
    score: 0,
    max,
    detail: regions.length > 0 ? `${regions.join(', ')} 근무 — 요청 지역과 다름` : '근무 지역 미등록',
  };
}

function scoreSkills(caregiver: MatchCaregiverConditions, required: string[]): MatchScoreItem {
  const max = MatchWeights.skills;

  // 필요 역량을 따로 고르지 않은 요청은 이 항목으로 순위를 가르지 않는다
  if (required.length === 0) {
    return { label: '역량', score: max, max, detail: '요청에 지정된 필요 역량 없음' };
  }

  const matched = required.filter((skill) => caregiver.skills.includes(skill));

  return {
    label: '역량',
    score: round((max * matched.length) / required.length),
    max,
    detail:
      matched.length === required.length
        ? `필요 역량 ${required.length}개 모두 가능`
        : `${required.length}개 중 ${matched.length}개 가능${matched.length > 0 ? ` (${matched.join(', ')})` : ''}`,
  };
}

function scoreAvailability(
  availability: AvailabilitySlot[],
  request: MatchRequestConditions
): MatchScoreItem {
  const max = MatchWeights.availability;

  if (availability.length === 0) {
    return { label: '가능 시간', score: 0, max, detail: '가능 시간 미설정' };
  }

  const weekdays = weekdaysInPeriod(request.startDate, request.endDate);
  const slots = slotsForTimeRange(request.dailyStartTime, request.dailyEndTime);

  // 시각을 정하지 않은 요청(협의)은 그 요일에 일할 수 있는지만 본다
  if (slots.length === 0) {
    const covered = weekdays.filter(
      (weekday) => slotsForWeekday(availability, weekday).length > 0
    ).length;

    return {
      label: '가능 시간',
      score: round((max * covered) / weekdays.length),
      max,
      detail: `간병 요일 ${weekdays.length}일 중 ${covered}일 근무 가능 (시간대 협의)`,
    };
  }

  const total = weekdays.length * slots.length;
  const covered = weekdays.reduce(
    (sum, weekday) => sum + slots.filter((slot) => hasSlot(availability, weekday, slot)).length,
    0
  );

  return {
    label: '가능 시간',
    score: round((max * covered) / total),
    max,
    detail:
      covered === total
        ? '요청 시간대 전부 근무 가능'
        : `요청 시간대 ${total}칸 중 ${covered}칸 근무 가능`,
  };
}

function scoreBudget(caregiver: MatchCaregiverConditions, budget?: number): MatchScoreItem {
  const max = MatchWeights.budget;
  const wage = caregiver.minDailyWage;

  // 한쪽이라도 금액을 정하지 않았으면 협의 대상이다. 그걸로 순위를 낮추지 않는다.
  if (budget === undefined || wage === undefined) {
    return { label: '일당', score: max, max, detail: '일당 협의' };
  }
  if (budget >= wage) {
    return {
      label: '일당',
      score: max,
      max,
      detail: `희망 ${wage.toLocaleString('ko-KR')}원 — 예산 안에 들어옴`,
    };
  }
  // 10% 안쪽이면 조율해 볼 만한 차이로 본다
  if (budget >= wage * 0.9) {
    return {
      label: '일당',
      score: round(max * 0.5),
      max,
      detail: `희망 ${wage.toLocaleString('ko-KR')}원 — 예산보다 조금 높음`,
    };
  }

  return {
    label: '일당',
    score: 0,
    max,
    detail: `희망 ${wage.toLocaleString('ko-KR')}원 — 예산보다 높음`,
  };
}

function scoreExperience(years: number): MatchScoreItem {
  const max = MatchWeights.experience;

  return {
    label: '경력',
    score: round((max * Math.min(years, ExperienceCap)) / ExperienceCap),
    max,
    detail: years > 0 ? `간병 경력 ${years}년` : '간병 경력 없음',
  };
}

function scoreCertification(certifications: string[]): MatchScoreItem {
  const max = MatchWeights.certification;
  const count = certifications.length;

  if (count === 0) {
    return { label: '자격', score: 0, max, detail: '등록된 자격 없음' };
  }

  return {
    label: '자격',
    score: count >= 2 ? max : round(max * 0.6),
    max,
    detail: certifications.join(', '),
  };
}

function scoreTraining(completedTrainings: string[]): MatchScoreItem {
  const max = MatchWeights.training;
  const count = completedTrainings.length;

  return {
    label: '교육 수료',
    score: round((max * Math.min(count, TrainingCap)) / TrainingCap),
    max,
    detail: count > 0 ? completedTrainings.join(', ') : '수료한 앱 교육 없음',
  };
}

/**
 * 아무리 점수가 높아도 추천해서는 안 되는 조건.
 *
 * 맡을 수 없는 장소나 보호자가 지정하지 않은 성별은 '조금 안 맞는' 것이 아니라 '틀린' 것이다.
 * 이런 것을 감점으로 처리하면 다른 항목 점수가 높을 때 목록 위로 올라와 버린다.
 */
function findExclusion(
  caregiver: MatchCaregiverConditions,
  request: MatchRequestConditions
): string | null {
  if (!caregiver.careTypes.includes(request.careType)) {
    return `${CareTypeLabels[request.careType]}을 맡지 않습니다.`;
  }

  if (
    request.preferredCaregiverGender !== 'any' &&
    caregiver.gender !== request.preferredCaregiverGender
  ) {
    return `보호자가 ${CaregiverGenderPreferenceLabels[request.preferredCaregiverGender]}을 지정했습니다.`;
  }

  return null;
}

/** 요청 하나와 간병인 한 명의 적합도. 제외 조건에 걸리면 총점 0에 이유가 붙는다. */
export function scoreMatch(
  caregiver: MatchCaregiverConditions,
  request: MatchRequestConditions
): MatchResult {
  const excludedReason = findExclusion(caregiver, request);

  if (excludedReason) {
    return { total: 0, isEligible: false, excludedReason, items: [] };
  }

  const items = [
    scoreRegion(caregiver, request.region),
    scoreSkills(caregiver, request.requiredSkills),
    scoreAvailability(caregiver.availability, request),
    scoreBudget(caregiver, request.budgetPerDay),
    scoreExperience(caregiver.yearsOfExperience),
    scoreCertification(caregiver.certifications),
    scoreTraining(caregiver.completedTrainings),
  ];

  return {
    total: Math.round(items.reduce((sum, item) => sum + item.score, 0)),
    isEligible: true,
    items,
  };
}

/** 요청 하나와 점수를 묶은 결과. 프로필이 없으면 점수는 없다. */
export type RankedRequest<T> = {
  request: T;
  score: MatchResult | null;
};

/**
 * 간병인 화면에서 쓰는 정렬 — 나에게 잘 맞는 요청이 위로 온다.
 *
 * 프로필을 아직 등록하지 않았으면 점수를 매길 수 없으므로 올라온 순서를 그대로 둔다.
 * 조건이 맞지 않는 요청(맡지 않는 장소 등)은 지우지 않고 맨 아래로 내린다 —
 * 목록에서 소리 없이 사라지면 왜 안 보이는지 알 수 없기 때문이다.
 */
export function rankRequestsForCaregiver<T extends MatchRequestConditions>(
  requests: T[],
  caregiver: MatchCaregiverConditions | null
): RankedRequest<T>[] {
  if (!caregiver) {
    return requests.map((request) => ({ request, score: null }));
  }

  return requests
    .map((request) => ({ request, score: scoreMatch(caregiver, request) }))
    .sort((a, b) => {
      if (a.score.isEligible !== b.score.isEligible) {
        return a.score.isEligible ? -1 : 1;
      }
      return b.score.total - a.score.total;
    });
}

/**
 * 수료 기록을 과정 이름으로 바꾼다. 없어진 과정의 수료는 세지 않는다.
 * 보호자 쪽(추천 후보)과 간병인 쪽(내 화면)이 같은 이름 목록으로 점수를 내게 한 곳에 둔다.
 */
export function completedTrainingTitles(
  courses: Pick<TrainingCourse, 'id' | 'title'>[],
  completions: Pick<TrainingCompletion, 'courseId'>[]
): string[] {
  return completions.flatMap((completion) => {
    const course = courses.find((item) => item.id === completion.courseId);
    return course ? [course.title] : [];
  });
}
