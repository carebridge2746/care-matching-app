import { ApiError } from '@/api/api-error';
import { readMockUsers } from '@/api/auth.mock';
import { readAllMockCaregiverProfiles } from '@/api/caregiver.mock';
import type { MatchingAdapter } from '@/api/matching.types';
import { delay, loadCareRequests } from '@/api/mock-store';
import { scoreMatch } from '@/lib/matching';
import { maskPersonName } from '@/lib/privacy';
import type { CaregiverCandidate, CaregiverProfile } from '@/types';

/**
 * 로컬 Mock 매칭 어댑터.
 *
 * Supabase 쪽에서는 데이터베이스 함수가 하는 일 — 요청을 찾고, 본인 요청인지 확인하고,
 * 제외 조건에 걸리는 사람을 걸러 내고, 이름을 가려서 내보내는 일 — 을 여기서 그대로 한다.
 * 점수 계산은 양쪽 모두 src/lib/matching.ts 가 맡는다.
 */

/** 추천 후보로 한 번에 내려보내는 최대 인원. Supabase 쪽 함수와 같은 값이어야 한다. */
const CandidateLimit = 50;

function toCandidate(profile: CaregiverProfile, name: string): CaregiverCandidate {
  return {
    id: profile.id,
    // 매칭이 확정되기 전에는 성만 보여 준다 (환자 이름을 가리는 것과 같은 규칙)
    name: maskPersonName(name),
    gender: profile.gender,
    yearsOfExperience: profile.yearsOfExperience,
    certifications: profile.certifications,
    skills: profile.skills,
    careTypes: profile.careTypes,
    regions: profile.regions,
    ...(profile.minDailyWage !== undefined ? { minDailyWage: profile.minDailyWage } : {}),
    ...(profile.introduction ? { introduction: profile.introduction } : {}),
    availability: profile.availability,
  };
}

export const mockMatchingAdapter: MatchingAdapter = {
  async listCandidates(requestId) {
    await delay();

    const requests = await loadCareRequests();
    const request = requests.find((item) => item.id === requestId);

    if (!request) {
      throw new ApiError('not_found', '요청을 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }

    const [profiles, users] = await Promise.all([
      readAllMockCaregiverProfiles(),
      readMockUsers(),
    ]);

    return profiles
      .filter((profile) => {
        // 이미 이 요청을 수락한 사람은 다시 추천하지 않는다
        if (profile.id === request.matchedCaregiverId) {
          return false;
        }
        // 맡을 수 없는 장소이거나 보호자가 지정한 성별이 아니면 후보가 아니다
        return scoreMatch(profile, request).isEligible;
      })
      .flatMap((profile) => {
        const user = users.find((item) => item.id === profile.id);
        // 계정이 사라진 프로필은 내보내지 않는다 (Supabase 쪽에서는 조인이 같은 일을 한다)
        return user ? [toCandidate(profile, user.name)] : [];
      })
      .slice(0, CandidateLimit);
  },
};
