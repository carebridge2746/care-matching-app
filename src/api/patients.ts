import { backendMode } from '@/api/mode';
import { mockPatientsAdapter } from '@/api/patients.mock';
import { supabasePatientsAdapter } from '@/api/patients.supabase';
import type { PatientsAdapter } from '@/api/patients.types';

export type { PatientInput, PatientsAdapter } from '@/api/patients.types';

/**
 * 환자 정보 진입점.
 * 화면과 저장소는 항상 `patientsApi`만 호출한다.
 */
export const patientsApi: PatientsAdapter =
  backendMode === 'supabase' ? supabasePatientsAdapter : mockPatientsAdapter;
