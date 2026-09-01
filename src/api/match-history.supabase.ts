import { ApiError } from '@/api/api-error';
import { MatchStatusFromRow, type MatchDetailRow } from '@/api/database.types';
import type { MatchHistoryAdapter } from '@/api/match-history.types';
import { getSupabaseClient } from '@/api/supabase-client';
import { toApiError } from '@/api/supabase-error';
import type { CareMatch } from '@/types';

/**
 * Supabase 매칭 이력 어댑터.
 *
 * 앱은 matches 테이블을 직접 바꾸지 못한다. 창구는 두 종류다.
 *   - 조회: public.match_details 뷰 (본인이 낀 매칭만, 취소된 매칭은 연락처를 다시 가린다)
 *   - 상태 변경: start_care() / complete_care() / cancel_match() 함수
 *
 * 세 함수는 지금 상태에서 할 수 없는 동작이면 예외 대신 null 을 돌려준다.
 * 목록을 띄워 둔 사이에 상대가 먼저 상태를 바꾸는 일은 오류가 아니라 흔한 일이고,
 * 그 상황은 여기서 `invalid_state` 로 바꿔 화면이 목록을 다시 불러오게 한다.
 */

const Columns =
  'id, request_id, guardian_id, caregiver_id, status, accepted_at, started_at, completed_at, cancelled_at, cancelled_by, cancel_reason, created_at, updated_at, request_text, care_type, region, start_date, end_date, daily_start_time, daily_end_time, required_skills, budget_per_day, patient_name, patient_birth_year, patient_gender, patient_mobility, patient_cognition, patient_conditions, patient_care_notes, caregiver_name, caregiver_phone, guardian_name, guardian_phone';

function toCareMatch(row: MatchDetailRow): CareMatch {
  return {
    id: row.id,
    requestId: row.request_id,
    guardianId: row.guardian_id,
    caregiverId: row.caregiver_id,
    status: MatchStatusFromRow[row.status],
    acceptedAt: row.accepted_at,
    ...(row.started_at ? { startedAt: row.started_at } : {}),
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.cancelled_at ? { cancelledAt: row.cancelled_at } : {}),
    // 화면에는 식별자가 아니라 '보호자가 취소'처럼 보여 준다
    ...(row.cancelled_by
      ? { cancelledBy: row.cancelled_by === row.caregiver_id ? 'caregiver' : 'guardian' }
      : {}),
    ...(row.cancel_reason ? { cancelReason: row.cancel_reason } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,

    care: {
      requestText: row.request_text,
      careType: row.care_type,
      region: row.region,
      startDate: row.start_date,
      ...(row.end_date ? { endDate: row.end_date } : {}),
      // time 컬럼은 'HH:MM:SS' 로 내려온다. 화면은 초를 쓰지 않는다.
      ...(row.daily_start_time ? { dailyStartTime: row.daily_start_time.slice(0, 5) } : {}),
      ...(row.daily_end_time ? { dailyEndTime: row.daily_end_time.slice(0, 5) } : {}),
      requiredSkills: row.required_skills,
      ...(row.budget_per_day !== null ? { budgetPerDay: row.budget_per_day } : {}),
    },

    patient: {
      name: row.patient_name,
      birthYear: row.patient_birth_year,
      gender: row.patient_gender,
      mobility: row.patient_mobility,
      cognition: row.patient_cognition,
      conditions: row.patient_conditions,
      ...(row.patient_care_notes ? { careNotes: row.patient_care_notes } : {}),
    },

    caregiver: {
      name: row.caregiver_name,
      ...(row.caregiver_phone ? { phone: row.caregiver_phone } : {}),
    },
    guardian: {
      name: row.guardian_name,
      ...(row.guardian_phone ? { phone: row.guardian_phone } : {}),
    },
  };
}

/** 상태를 옮긴 뒤, 바뀐 매칭을 화면이 그대로 쓸 수 있는 모양으로 다시 읽는다 */
async function readMatch(matchId: string): Promise<CareMatch> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('match_details')
    .select(Columns)
    .eq('id', matchId)
    .maybeSingle();

  if (error) {
    throw toApiError(error, '간병 정보를 불러오지 못했습니다.');
  }
  if (!data) {
    throw new ApiError('not_found', '간병 정보를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
  }

  return toCareMatch(data);
}

export const supabaseMatchHistoryAdapter: MatchHistoryAdapter = {
  async listForGuardian(guardianId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('match_details')
      .select(Columns)
      .eq('guardian_id', guardianId)
      .order('accepted_at', { ascending: false });

    if (error) {
      throw toApiError(error, '간병 진행 상황을 불러오지 못했습니다.');
    }

    return data.map(toCareMatch);
  },

  async listForCaregiver(caregiverId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('match_details')
      .select(Columns)
      .eq('caregiver_id', caregiverId)
      .order('accepted_at', { ascending: false });

    if (error) {
      throw toApiError(error, '간병 진행 상황을 불러오지 못했습니다.');
    }

    return data.map(toCareMatch);
  },

  // 누가 부르는지는 데이터베이스가 직접 본다. 앱이 보낸 식별자는 쓰지 않는다.
  async start(matchId, _caregiverId) {
    const supabase = getSupabaseClient();
    const { data: startedId, error } = await supabase.rpc('start_care', { match_id: matchId });

    if (error) {
      throw toApiError(error, '간병을 시작하지 못했습니다.');
    }
    if (!startedId) {
      throw new ApiError(
        'invalid_state',
        '이미 시작했거나 끝난 간병입니다. 목록을 새로 불러와 주세요.'
      );
    }

    return readMatch(startedId);
  },

  async complete(matchId, _actorId) {
    const supabase = getSupabaseClient();
    const { data: completedId, error } = await supabase.rpc('complete_care', { match_id: matchId });

    if (error) {
      throw toApiError(error, '간병을 종료하지 못했습니다.');
    }
    if (!completedId) {
      throw new ApiError(
        'invalid_state',
        '진행중인 간병만 종료할 수 있습니다. 목록을 새로 불러와 주세요.'
      );
    }

    return readMatch(completedId);
  },

  async cancel(matchId, _actorId, reason) {
    const supabase = getSupabaseClient();
    const { data: cancelledId, error } = await supabase.rpc('cancel_match', {
      match_id: matchId,
      reason: reason?.trim() || null,
    });

    if (error) {
      throw toApiError(error, '간병을 취소하지 못했습니다.');
    }
    if (!cancelledId) {
      throw new ApiError('invalid_state', '이미 끝났거나 취소된 간병입니다.');
    }

    return readMatch(cancelledId);
  },
};
