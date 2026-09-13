import {
  MatchWeights,
  rankRequestsForCaregiver,
  scoreMatch,
  type MatchCaregiverConditions,
  type MatchRequestConditions,
} from '@/lib/matching';
import type { AvailabilitySlot, Weekday } from '@/types';

const Weekdays: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

const weekdayDaytime: AvailabilitySlot[] = Weekdays.flatMap((weekday) => [
  { weekday, slot: 'morning' as const },
  { weekday, slot: 'afternoon' as const },
]);

const caregiver: MatchCaregiverConditions = {
  gender: 'female',
  yearsOfExperience: 8,
  certifications: ['요양보호사', '간호조무사'],
  skills: ['식사 보조', '체위 변경'],
  careTypes: ['hospital'],
  regions: ['서울 강남구'],
  minDailyWage: 120000,
  availability: weekdayDaytime,
};

// 2026-09-14 는 월요일, 2026-09-18 은 금요일이다
const request: MatchRequestConditions = {
  careType: 'hospital',
  region: '서울 강남구',
  requiredSkills: ['식사 보조', '체위 변경'],
  preferredCaregiverGender: 'any',
  budgetPerDay: 150000,
  startDate: '2026-09-14',
  endDate: '2026-09-18',
  dailyStartTime: '09:00',
  dailyEndTime: '17:00',
};

function itemScore(result: ReturnType<typeof scoreMatch>, label: string): number | undefined {
  return result.items.find((item) => item.label === label)?.score;
}

describe('scoreMatch', () => {
  it('배점의 합은 100이다', () => {
    expect(Object.values(MatchWeights).reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('모든 조건이 맞으면 100점이다', () => {
    const result = scoreMatch(caregiver, request);
    expect(result.isEligible).toBe(true);
    expect(result.total).toBe(100);
  });

  describe('제외 조건은 감점이 아니라 제외다', () => {
    it('맡지 않는 간병 장소', () => {
      const result = scoreMatch({ ...caregiver, careTypes: ['home'] }, request);
      expect(result).toMatchObject({ total: 0, isEligible: false, items: [] });
      expect(result.excludedReason).toContain('병원 간병');
    });

    it('보호자가 지정한 성별이 아님', () => {
      const result = scoreMatch(caregiver, { ...request, preferredCaregiverGender: 'male' });
      expect(result.isEligible).toBe(false);
      expect(result.excludedReason).toContain('남성 간병인');
    });
  });

  describe('지역', () => {
    it('띄어쓰기가 달라도 같은 지역으로 본다', () => {
      expect(itemScore(scoreMatch(caregiver, { ...request, region: ' 서울  강남구 ' }), '지역')).toBe(25);
    });

    it('같은 시/도의 다른 구는 60%', () => {
      expect(itemScore(scoreMatch(caregiver, { ...request, region: '서울 송파구' }), '지역')).toBe(15);
    });

    it('다른 시/도는 0점', () => {
      expect(itemScore(scoreMatch(caregiver, { ...request, region: '경기 성남시' }), '지역')).toBe(0);
    });
  });

  describe('역량', () => {
    it('필요 역량 중 가능한 비율만큼', () => {
      const result = scoreMatch(caregiver, { ...request, requiredSkills: ['식사 보조', '흡인(석션)'] });
      expect(itemScore(result, '역량')).toBe(12.5);
    });

    it('필요 역량을 지정하지 않은 요청은 이 항목으로 순위를 가르지 않는다', () => {
      expect(itemScore(scoreMatch(caregiver, { ...request, requiredSkills: [] }), '역량')).toBe(25);
    });
  });

  describe('가능 시간', () => {
    it('가능 시간을 설정하지 않았으면 0점', () => {
      expect(itemScore(scoreMatch({ ...caregiver, availability: [] }, request), '가능 시간')).toBe(0);
    });

    it('시각을 정하지 않은 요청은 요일만 본다 — 종료일이 없으면 7일 모두', () => {
      const result = scoreMatch(caregiver, {
        ...request,
        endDate: undefined,
        dailyStartTime: undefined,
        dailyEndTime: undefined,
      });
      // 7일 중 평일 5일
      expect(itemScore(result, '가능 시간')).toBe(14.3);
    });

    it('야간 요청은 오전·오후만 되는 사람에게 0점', () => {
      const result = scoreMatch(caregiver, { ...request, dailyStartTime: '20:00', dailyEndTime: '06:00' });
      expect(itemScore(result, '가능 시간')).toBe(0);
    });
  });

  describe('일당', () => {
    it.each([
      [150000, 15],
      [120000, 15],
      [110000, 7.5],
      [100000, 0],
    ])('예산 %d원, 희망 12만원 → %d점', (budgetPerDay, expected) => {
      expect(itemScore(scoreMatch(caregiver, { ...request, budgetPerDay }), '일당')).toBe(expected);
    });

    it('한쪽이라도 금액이 없으면 협의로 보고 깎지 않는다', () => {
      expect(itemScore(scoreMatch(caregiver, { ...request, budgetPerDay: undefined }), '일당')).toBe(15);
      expect(itemScore(scoreMatch({ ...caregiver, minDailyWage: undefined }, request), '일당')).toBe(15);
    });
  });

  it('경력은 5년에서 만점이 되고 더 벌어지지 않는다', () => {
    expect(itemScore(scoreMatch({ ...caregiver, yearsOfExperience: 0 }, request), '경력')).toBe(0);
    expect(itemScore(scoreMatch({ ...caregiver, yearsOfExperience: 2 }, request), '경력')).toBe(4);
    expect(itemScore(scoreMatch({ ...caregiver, yearsOfExperience: 20 }, request), '경력')).toBe(10);
  });

  it('자격은 하나면 60%, 둘 이상이면 만점', () => {
    expect(itemScore(scoreMatch({ ...caregiver, certifications: [] }, request), '자격')).toBe(0);
    expect(itemScore(scoreMatch({ ...caregiver, certifications: ['요양보호사'] }, request), '자격')).toBe(3);
  });
});

describe('rankRequestsForCaregiver', () => {
  const good = { ...request, id: 'good' };
  const partial = { ...request, id: 'partial', region: '서울 송파구' };
  const excluded = { ...request, id: 'excluded', careType: 'home' as const };

  it('잘 맞는 요청이 위로, 제외된 요청은 지우지 않고 맨 아래로', () => {
    const ranked = rankRequestsForCaregiver([excluded, partial, good], caregiver);
    expect(ranked.map((item) => item.request.id)).toEqual(['good', 'partial', 'excluded']);
    expect(ranked[2]?.score?.isEligible).toBe(false);
  });

  it('프로필이 없으면 점수 없이 올라온 순서 그대로', () => {
    const ranked = rankRequestsForCaregiver([excluded, partial, good], null);
    expect(ranked.map((item) => item.request.id)).toEqual(['excluded', 'partial', 'good']);
    expect(ranked.every((item) => item.score === null)).toBe(true);
  });
});
