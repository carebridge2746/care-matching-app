import { ApiError } from '@/api/api-error';
import type { CareRequestInput, CareRequestsAdapter } from '@/api/care-requests.types';
import {
  CareRequestStatusFromRow,
  type CareRequestRow,
  type CaregiverCareRequestRow,
  type Database,
} from '@/api/database.types';
import { getSupabaseClient } from '@/api/supabase-client';
import { toApiError } from '@/api/supabase-error';
import type { CareRequest, CaregiverCareRequest } from '@/types';

/**
 * Supabase 간병 요청 어댑터.
 *
 * 상태 값은 데이터베이스가 snake_case(in_progress), 앱이 camelCase(inProgress)를 쓴다.
 * 변환은 이 경계에서만 한다.
 *
 * 간병인은 care_requests 테이블을 직접 읽지 못한다. 대신 두 창구만 쓴다.
 *   - 조회: public.caregiver_care_requests 뷰 (보호자 식별 정보 없음, 환자 이름은 매칭 전까지 가려짐)
 *   - 수락: public.accept_care_request() 함수 (대기중인 요청만 바꾼다)
 * 누가 무엇을 볼 수 있는지를 클라이언트 조건이 아니라 데이터베이스가 정하기 위해서다.
 */

const Columns =
  'id, guardian_id, patient_id, request_text, care_type, region, start_date, end_date, daily_start_time, daily_end_time, required_skills, preferred_caregiver_gender, budget_per_day, status, matched_caregiver_id, matched_at, created_at, updated_at';

const CaregiverColumns =
  'id, request_text, care_type, region, start_date, end_date, daily_start_time, daily_end_time, required_skills, preferred_caregiver_gender, budget_per_day, status, matched_caregiver_id, matched_at, created_at, updated_at, patient_name, patient_birth_year, patient_gender, patient_mobility, patient_cognition, patient_conditions';

/** 조회한 컬럼만 담긴 행 (ai_conditions 등은 목록 화면에서 쓰지 않아 받아오지 않는다) */
type SelectedRow = Omit<CareRequestRow, 'ai_conditions' | 'ai_analyzed_at'>;

type CareRequestInsert = Database['public']['Tables']['care_requests']['Insert'];

/** 보호자용과 간병인용이 똑같이 쓰는 조건 부분 */
function toCareRequestFields(row: SelectedRow | CaregiverCareRequestRow) {
  return {
    requestText: row.request_text,
    careType: row.care_type,
    region: row.region,
    startDate: row.start_date,
    ...(row.end_date ? { endDate: row.end_date } : {}),
    // time 컬럼은 'HH:MM:SS' 로 내려온다. 화면은 초를 쓰지 않는다.
    ...(row.daily_start_time ? { dailyStartTime: row.daily_start_time.slice(0, 5) } : {}),
    ...(row.daily_end_time ? { dailyEndTime: row.daily_end_time.slice(0, 5) } : {}),
    requiredSkills: row.required_skills,
    preferredCaregiverGender: row.preferred_caregiver_gender,
    ...(row.budget_per_day !== null ? { budgetPerDay: row.budget_per_day } : {}),
    status: CareRequestStatusFromRow[row.status],
    ...(row.matched_caregiver_id ? { matchedCaregiverId: row.matched_caregiver_id } : {}),
    ...(row.matched_at ? { matchedAt: row.matched_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toCareRequest(row: SelectedRow): CareRequest {
  return {
    id: row.id,
    guardianId: row.guardian_id,
    patientId: row.patient_id,
    ...toCareRequestFields(row),
  };
}

function toCaregiverCareRequest(row: CaregiverCareRequestRow): CaregiverCareRequest {
  return {
    id: row.id,
    ...toCareRequestFields(row),
    patient: {
      name: row.patient_name,
      birthYear: row.patient_birth_year,
      gender: row.patient_gender,
      mobility: row.patient_mobility,
      cognition: row.patient_cognition,
      conditions: row.patient_conditions,
    },
  };
}

function toColumns(guardianId: string, input: CareRequestInput): CareRequestInsert {
  return {
    guardian_id: guardianId,
    patient_id: input.patientId,
    request_text: input.requestText.trim(),
    care_type: input.careType,
    region: input.region.trim(),
    start_date: input.startDate,
    end_date: input.endDate || null,
    daily_start_time: input.dailyStartTime || null,
    daily_end_time: input.dailyEndTime || null,
    required_skills: input.requiredSkills,
    preferred_caregiver_gender: input.preferredCaregiverGender,
    budget_per_day: input.budgetPerDay ?? null,
  };
}

export const supabaseCareRequestsAdapter: CareRequestsAdapter = {
  async list(guardianId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('care_requests')
      .select(Columns)
      .eq('guardian_id', guardianId)
      .order('created_at', { ascending: false });

    if (error) {
      throw toApiError(error, '간병 요청 목록을 불러오지 못했습니다.');
    }

    return data.map(toCareRequest);
  },

  async create(guardianId, input) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('care_requests')
      .insert(toColumns(guardianId, input))
      .select(Columns)
      .single();

    if (error) {
      throw toApiError(error, '간병 요청을 저장하지 못했습니다.');
    }

    return toCareRequest(data);
  },

  async cancel(id) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('care_requests')
      .update({ status: 'cancelled' })
      .eq('id', id)
      // 이미 끝났거나 취소된 요청은 건드리지 않는다
      .not('status', 'in', '("completed","cancelled")')
      .select(Columns)
      .maybeSingle();

    if (error) {
      throw toApiError(error, '요청을 취소하지 못했습니다.');
    }
    if (!data) {
      throw new ApiError('invalid_state', '이미 끝났거나 취소된 요청입니다. 목록을 새로 불러와 주세요.');
    }

    return toCareRequest(data);
  },

  async remove(id) {
    const supabase = getSupabaseClient();
    // 삭제 정책이 pending 상태만 허용한다. 막히면 오류 없이 0건이 지워지므로 결과로 확인한다.
    const { data, error } = await supabase.from('care_requests').delete().eq('id', id).select('id');

    if (error) {
      throw toApiError(error, '요청을 삭제하지 못했습니다.');
    }
    if (data.length === 0) {
      throw new ApiError(
        'invalid_state',
        '이미 매칭이 진행된 요청은 삭제할 수 없습니다. 취소만 가능합니다.'
      );
    }
  },

  // caregiverId 를 조건으로 걸지 않는다. 뷰가 이미 로그인한 사용자를 기준으로 행을 고른다.
  async listAvailable(_caregiverId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('caregiver_care_requests')
      .select(CaregiverColumns)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      throw toApiError(error, '간병 요청 목록을 불러오지 못했습니다.');
    }

    return data.map(toCaregiverCareRequest);
  },

  async listAccepted(caregiverId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('caregiver_care_requests')
      .select(CaregiverColumns)
      .eq('matched_caregiver_id', caregiverId)
      .order('matched_at', { ascending: false });

    if (error) {
      throw toApiError(error, '수락한 간병 요청을 불러오지 못했습니다.');
    }

    return data.map(toCaregiverCareRequest);
  },

  async accept(id, _caregiverId) {
    const supabase = getSupabaseClient();

    // 함수 안에서 status 가 pending 인 행만 바꾼다.
    // 두 간병인이 동시에 눌러도 한 명만 성공하고 나머지는 null 을 받는다.
    const { data: acceptedId, error } = await supabase.rpc('accept_care_request', {
      request_id: id,
    });

    if (error) {
      throw toApiError(error, '요청을 수락하지 못했습니다.');
    }
    if (!acceptedId) {
      throw new ApiError(
        'invalid_state',
        '이미 다른 간병인이 수락했거나 보호자가 취소한 요청입니다. 목록을 새로 불러와 주세요.'
      );
    }

    // 수락한 뒤에는 환자 이름이 가려지지 않은 상태로 내려온다
    const { data, error: readError } = await supabase
      .from('caregiver_care_requests')
      .select(CaregiverColumns)
      .eq('id', acceptedId)
      .maybeSingle();

    if (readError) {
      throw toApiError(readError, '수락한 요청을 불러오지 못했습니다.');
    }
    if (!data) {
      throw new ApiError('not_found', '수락한 요청을 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }

    return toCaregiverCareRequest(data);
  },
};
