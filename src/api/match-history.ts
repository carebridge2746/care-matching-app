import { mockMatchHistoryAdapter } from '@/api/match-history.mock';
import { supabaseMatchHistoryAdapter } from '@/api/match-history.supabase';
import type { MatchHistoryAdapter } from '@/api/match-history.types';
import { backendMode } from '@/api/mode';

export type { MatchHistoryAdapter } from '@/api/match-history.types';

/**
 * 매칭 이력 진입점.
 * 화면과 저장소는 항상 `matchHistoryApi`만 호출한다.
 */
export const matchHistoryApi: MatchHistoryAdapter =
  backendMode === 'supabase' ? supabaseMatchHistoryAdapter : mockMatchHistoryAdapter;
