import { mockMatchingAdapter } from '@/api/matching.mock';
import { supabaseMatchingAdapter } from '@/api/matching.supabase';
import type { MatchingAdapter } from '@/api/matching.types';
import { backendMode } from '@/api/mode';

export type { MatchingAdapter } from '@/api/matching.types';

/**
 * 매칭 진입점.
 * 화면과 저장소는 항상 `matchingApi`만 호출한다.
 */
export const matchingApi: MatchingAdapter =
  backendMode === 'supabase' ? supabaseMatchingAdapter : mockMatchingAdapter;
