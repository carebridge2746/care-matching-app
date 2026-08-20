import { ApiError } from '@/api/api-error';
import type { CareRequestInput, CareRequestsAdapter } from '@/api/care-requests.types';
import {
  CareRequestStatusFromRow,
  type CareRequestRow,
  type Database,
} from '@/api/database.types';
import { getSupabaseClient } from '@/api/supabase-client';
import { toApiError } from '@/api/supabase-error';
import type { CareRequest } from '@/types';

/**
 * Supabase 간병 요청 어댑터.
 *
 * 상태 값은 데이터베이스가 snake_case(in_progress), 앱이 camelCase(inProgress)를 쓴다.
 * 변환은 이 경계에서만 한다.
 */

const Columns =
  'id, guardian_id, patient_id, request_text, care_type, region, start_date, end_date, daily_start_time, daily_end_time, required_skills, preferred_caregiver_gender, budget_per_day, status, created_at, updated_at';

/** 조회한 컬럼만 담긴 행 (ai_conditions 등은 목록 화면에서 쓰지 않아 받아오지 않는다) */
type SelectedRow = Omit<CareRequestRow, 'ai_conditions' | 'ai_analyzed_at'>;

type CareRequestInsert = Database['public']['Tables']['care_requests']['Insert'];

function toCareRequest(row: SelectedRow): CareRequest {
  return {
    id: row.id,
    guardianId: row.guardian_id,
    patientId: row.patient_id,
    requestText: row.request_text,
    careType: row.care_type,
    region: row.region,
    startDate: row.start_date,
    ...(row.end_date ? { endDate: row.end_date } : {}),
    ...(row.daily_start_time ? { dailyStartTime: row.daily_start_time.slice(0, 5) } : {}),
    ...(row.daily_end_time ? { dailyEndTime: row.daily_end_time.slice(0, 5) } : {}),
    requiredSkills: row.required_skills,
    preferredCaregiverGender: row.preferred_caregiver_gender,
    ...(row.budget_per_day !== null ? { budgetPerDay: row.budget_per_day } : {}),
    status: CareRequestStatusFromRow[row.status],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
};
