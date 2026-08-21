import { mockCaregiverAdapter } from '@/api/caregiver.mock';
import { supabaseCaregiverAdapter } from '@/api/caregiver.supabase';
import type { CaregiverAdapter } from '@/api/caregiver.types';
import { backendMode } from '@/api/mode';

export type { CaregiverAdapter, CaregiverProfileInput } from '@/api/caregiver.types';

/**
 * 간병인 프로필 진입점.
 * 화면과 저장소는 항상 `caregiverApi`만 호출한다.
 */
export const caregiverApi: CaregiverAdapter =
  backendMode === 'supabase' ? supabaseCaregiverAdapter : mockCaregiverAdapter;
