import { mockAdminAdapter } from '@/api/admin.mock';
import { supabaseAdminAdapter } from '@/api/admin.supabase';
import type { AdminAdapter } from '@/api/admin.types';
import { backendMode } from '@/api/mode';

export type { AdminAdapter } from '@/api/admin.types';

/**
 * 관리자 진입점.
 * 화면과 저장소는 항상 `adminApi`만 호출한다.
 */
export const adminApi: AdminAdapter =
  backendMode === 'supabase' ? supabaseAdminAdapter : mockAdminAdapter;
