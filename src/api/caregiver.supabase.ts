import { ApiError } from '@/api/api-error';
import type { CaregiverAdapter, CaregiverProfileInput } from '@/api/caregiver.types';
import type {
  CaregiverAvailabilityRow,
  CaregiverProfileRow,
  Database,
} from '@/api/database.types';
import { getSupabaseClient, type CareSupabaseClient } from '@/api/supabase-client';
import { toApiError } from '@/api/supabase-error';
import { sortSlots } from '@/lib/availability';
import type { CaregiverProfile } from '@/types';

/**
 * Supabase 간병인 프로필 어댑터.
 *
 * 프로필과 가능 시간은 테이블이 둘로 나뉘어 있다.
 * 시간표를 칸 단위 행으로 두면 Phase 6의 매칭이 "이 요일 이 시간에 가능한 사람"을
 * 조인 한 번으로 훑을 수 있다. jsonb 한 덩어리로 두면 그 조회가 훨씬 번거로워진다.
 *
 * 두 테이블 모두 본인만 다룰 수 있다. 보호자에게 간병인을 공개하는 일은
 * 추천 결과를 내보내는 Phase 6에서 별도 창구로 연다.
 */

const ProfileColumns =
  'id, gender, years_of_experience, certifications, skills, care_types, regions, min_daily_wage, introduction, created_at, updated_at';

type ProfileInsert = Database['public']['Tables']['caregiver_profiles']['Insert'];
type AvailabilityInsert = Database['public']['Tables']['caregiver_availability']['Insert'];

function toProfile(
  row: CaregiverProfileRow,
  availability: Pick<CaregiverAvailabilityRow, 'weekday' | 'slot'>[]
): CaregiverProfile {
  return {
    id: row.id,
    gender: row.gender,
    yearsOfExperience: row.years_of_experience,
    certifications: row.certifications,
    skills: row.skills,
    careTypes: row.care_types,
    regions: row.regions,
    ...(row.min_daily_wage !== null ? { minDailyWage: row.min_daily_wage } : {}),
    ...(row.introduction ? { introduction: row.introduction } : {}),
    availability: sortSlots(
      availability.map(({ weekday, slot }) => ({ weekday, slot }))
    ),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 비어 있는 선택 항목은 null 로 보낸다. 컬럼을 비우려면 undefined 가 아니라 null 이어야 한다. */
function toColumns(caregiverId: string, input: CaregiverProfileInput): ProfileInsert {
  return {
    id: caregiverId,
    gender: input.gender,
    years_of_experience: input.yearsOfExperience,
    certifications: input.certifications,
    skills: input.skills,
    care_types: input.careTypes,
    regions: input.regions.map((region) => region.trim()).filter(Boolean),
    min_daily_wage: input.minDailyWage ?? null,
    introduction: input.introduction?.trim() || null,
  };
}

/**
 * 시간표를 따로 읽는다.
 *
 * 한 번의 조회에 끼워 넣는(embed) 방법도 있지만, 그러려면 Database 타입에
 * 테이블 사이 관계를 모두 적어 두어야 한다. 조회가 두 번 늘어나는 편이 단순하다.
 */
async function readAvailability(
  supabase: CareSupabaseClient,
  caregiverId: string
): Promise<Pick<CaregiverAvailabilityRow, 'weekday' | 'slot'>[]> {
  const { data, error } = await supabase
    .from('caregiver_availability')
    .select('weekday, slot')
    .eq('caregiver_id', caregiverId);

  if (error) {
    throw toApiError(error, '가능 시간을 불러오지 못했습니다.');
  }

  return data;
}

export const supabaseCaregiverAdapter: CaregiverAdapter = {
  async getProfile(caregiverId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('caregiver_profiles')
      .select(ProfileColumns)
      .eq('id', caregiverId)
      .maybeSingle();

    if (error) {
      throw toApiError(error, '프로필을 불러오지 못했습니다.');
    }
    // 아직 등록하지 않은 상태다. 오류가 아니다.
    if (!data) {
      return null;
    }

    return toProfile(data, await readAvailability(supabase, caregiverId));
  },

  async saveProfile(caregiverId, input) {
    const supabase = getSupabaseClient();
    // 처음이면 insert, 이미 있으면 update — 화면에서는 같은 '저장' 한 번이다
    const { data, error } = await supabase
      .from('caregiver_profiles')
      .upsert(toColumns(caregiverId, input))
      .select(ProfileColumns)
      .single();

    if (error) {
      throw toApiError(error, '프로필을 저장하지 못했습니다.');
    }

    // 시간표는 이 저장으로 바뀌지 않는다. 화면이 최신 상태를 그대로 들고 있도록 함께 읽어 온다.
    return toProfile(data, await readAvailability(supabase, caregiverId));
  },

  async saveAvailability(caregiverId, slots) {
    const supabase = getSupabaseClient();

    const { data: profile, error: profileError } = await supabase
      .from('caregiver_profiles')
      .select(ProfileColumns)
      .eq('id', caregiverId)
      .maybeSingle();

    if (profileError) {
      throw toApiError(profileError, '프로필을 불러오지 못했습니다.');
    }
    if (!profile) {
      throw new ApiError('invalid_state', '프로필을 먼저 등록한 뒤 가능 시간을 설정해 주세요.');
    }

    // 표 전체를 바꾸므로 지우고 다시 넣는다. 자기 시간표를 자기가 고치는 것이라
    // 두 곳에서 동시에 저장할 일이 없어 트랜잭션으로 감싸지 않았다.
    const { error: deleteError } = await supabase
      .from('caregiver_availability')
      .delete()
      .eq('caregiver_id', caregiverId);

    if (deleteError) {
      throw toApiError(deleteError, '가능 시간을 저장하지 못했습니다.');
    }

    const rows: AvailabilityInsert[] = sortSlots(slots).map(({ weekday, slot }) => ({
      caregiver_id: caregiverId,
      weekday,
      slot,
    }));

    if (rows.length > 0) {
      const { error: insertError } = await supabase
        .from('caregiver_availability')
        .insert(rows);

      if (insertError) {
        throw toApiError(insertError, '가능 시간을 저장하지 못했습니다.');
      }
    }

    return toProfile(profile, rows);
  },
};
