import { mockLocationSharingAdapter } from '@/api/location-sharing.mock';
import { supabaseLocationSharingAdapter } from '@/api/location-sharing.supabase';
import type { LocationSharingAdapter } from '@/api/location-sharing.types';
import { backendMode } from '@/api/mode';

export type { LocationSharingAdapter } from '@/api/location-sharing.types';

/**
 * 안심 도착 진입점.
 * 화면과 저장소는 항상 `locationSharingApi`만 호출한다.
 */
export const locationSharingApi: LocationSharingAdapter =
  backendMode === 'supabase' ? supabaseLocationSharingAdapter : mockLocationSharingAdapter;
