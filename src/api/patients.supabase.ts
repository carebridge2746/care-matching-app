import { ApiError } from '@/api/api-error';
import type { Database, PatientRow } from '@/api/database.types';
import type { PatientInput, PatientsAdapter } from '@/api/patients.types';
import { getSupabaseClient } from '@/api/supabase-client';
import { toApiError } from '@/api/supabase-error';
import type { Patient } from '@/types';

/**
 * Supabase 환자 정보 어댑터.
 *
 * 조회 조건에 guardian_id 를 직접 걸지만, 실제 차단은 RLS가 한다.
 * 조건은 "필요한 만큼만 받아오기" 위한 것이고, 보안을 클라이언트에 맡기지 않는다.
 */

const Columns =
  'id, guardian_id, name, birth_year, gender, relationship, conditions, mobility, cognition, care_notes, created_at, updated_at';

type PatientInsert = Database['public']['Tables']['patients']['Insert'];

function toPatient(row: PatientRow): Patient {
  return {
    id: row.id,
    guardianId: row.guardian_id,
    name: row.name,
    birthYear: row.birth_year,
    gender: row.gender,
    ...(row.relationship ? { relationship: row.relationship } : {}),
    conditions: row.conditions,
    mobility: row.mobility,
    cognition: row.cognition,
    ...(row.care_notes ? { careNotes: row.care_notes } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 비어 있는 선택 항목은 null 로 보낸다. 컬럼을 비우려면 undefined 가 아니라 null 이어야 한다. */
function toColumns(guardianId: string, input: PatientInput): PatientInsert {
  return {
    guardian_id: guardianId,
    name: input.name.trim(),
    birth_year: input.birthYear,
    gender: input.gender,
    relationship: input.relationship?.trim() || null,
    conditions: input.conditions,
    mobility: input.mobility,
    cognition: input.cognition,
    care_notes: input.careNotes?.trim() || null,
  };
}

export const supabasePatientsAdapter: PatientsAdapter = {
  async list(guardianId) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('patients')
      .select(Columns)
      .eq('guardian_id', guardianId)
      .order('created_at', { ascending: false });

    if (error) {
      throw toApiError(error, '환자 목록을 불러오지 못했습니다.');
    }

    return data.map(toPatient);
  },

  async create(guardianId, input) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('patients')
      .insert(toColumns(guardianId, input))
      .select(Columns)
      .single();

    if (error) {
      throw toApiError(error, '환자 정보를 저장하지 못했습니다.');
    }

    return toPatient(data);
  },

  async update(id, input) {
    const supabase = getSupabaseClient();
    const { guardian_id: _guardianId, ...columns } = toColumns('', input);

    const { data, error } = await supabase
      .from('patients')
      .update(columns)
      .eq('id', id)
      .select(Columns)
      .maybeSingle();

    if (error) {
      throw toApiError(error, '환자 정보를 수정하지 못했습니다.');
    }
    if (!data) {
      // RLS가 막으면 오류 없이 0건이 바뀐다. 남의 자료이거나 이미 지워진 경우다.
      throw new ApiError('not_found', '환자 정보를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }

    return toPatient(data);
  },

  // 행을 직접 지우지 않고 remove_patient() 를 부른다. 간병 기록이 있으면 익명화해야 하는데,
  // 그 판단과 여러 표에 걸친 정리를 한 트랜잭션에서 해야 하기 때문이다(schema.sql 67).
  // 지운 환자는 조회 정책이 목록에서 뺀다.
  async remove(id) {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('remove_patient', { target_patient: id });

    if (error) {
      throw toApiError(error, '환자 정보를 삭제하지 못했습니다.');
    }
    if (!data) {
      throw new ApiError('not_found', '환자 정보를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    }

    return data;
  },
};
