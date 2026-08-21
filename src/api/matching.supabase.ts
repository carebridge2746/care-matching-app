import type { RecommendationCandidateRow } from '@/api/database.types';
import type { MatchingAdapter } from '@/api/matching.types';
import { getSupabaseClient } from '@/api/supabase-client';
import { toApiError } from '@/api/supabase-error';
import { sortSlots } from '@/lib/availability';
import {
  CareTimeSlots,
  Weekdays,
  type AvailabilitySlot,
  type CaregiverCandidate,
} from '@/types';

/**
 * Supabase 매칭 어댑터.
 *
 * 보호자는 caregiver_profiles 를 직접 읽지 못한다.
 * 대신 public.recommendation_candidates() 함수가 본인 요청인지 확인하고,
 * 제외 조건에 걸리지 않는 사람만 이름을 가려서 내보낸다.
 *
 * 점수는 여기서 매기지 않는다. 계산을 SQL에도 한 번 더 적으면 Mock 모드와 조금씩 어긋나기
 * 시작하므로, 데이터베이스는 "누구를 보여 줘도 되는가"까지만 정한다.
 */

/**
 * 가능 시간은 'mon:morning' 모양의 문자열 배열로 내려온다.
 * 칸마다 객체로 만들면 함수 반환 타입이 복잡해져서, 경계에서만 되돌린다.
 */
function parseAvailability(keys: string[]): AvailabilitySlot[] {
  const slots = keys.flatMap((key) => {
    const [weekday, slot] = key.split(':');

    // 알 수 없는 값은 조용히 버린다. 시간표 한 칸 때문에 화면 전체가 비면 안 된다.
    return Weekdays.includes(weekday as never) && CareTimeSlots.includes(slot as never)
      ? [{ weekday, slot } as AvailabilitySlot]
      : [];
  });

  return sortSlots(slots);
}

function toCandidate(row: RecommendationCandidateRow): CaregiverCandidate {
  return {
    id: row.caregiver_id,
    name: row.name,
    gender: row.gender,
    yearsOfExperience: row.years_of_experience,
    certifications: row.certifications,
    skills: row.skills,
    careTypes: row.care_types,
    regions: row.regions,
    ...(row.min_daily_wage !== null ? { minDailyWage: row.min_daily_wage } : {}),
    ...(row.introduction ? { introduction: row.introduction } : {}),
    availability: parseAvailability(row.availability),
  };
}

export const supabaseMatchingAdapter: MatchingAdapter = {
  async listCandidates(requestId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('recommendation_candidates', {
      request_id: requestId,
    });

    if (error) {
      throw toApiError(error, '추천 간병인을 불러오지 못했습니다.');
    }

    return data.map(toCandidate);
  },
};
