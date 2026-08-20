import { mockCareRequestsAdapter } from '@/api/care-requests.mock';
import { supabaseCareRequestsAdapter } from '@/api/care-requests.supabase';
import type { CareRequestsAdapter } from '@/api/care-requests.types';
import { backendMode } from '@/api/mode';

export type { CareRequestInput, CareRequestsAdapter } from '@/api/care-requests.types';

/**
 * 간병 요청 진입점.
 * 화면과 저장소는 항상 `careRequestsApi`만 호출한다.
 */
export const careRequestsApi: CareRequestsAdapter =
  backendMode === 'supabase' ? supabaseCareRequestsAdapter : mockCareRequestsAdapter;
