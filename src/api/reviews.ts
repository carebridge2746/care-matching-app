import { backendMode } from '@/api/mode';
import { mockReviewsAdapter } from '@/api/reviews.mock';
import { supabaseReviewsAdapter } from '@/api/reviews.supabase';
import type { ReviewsAdapter } from '@/api/reviews.types';

export type { ReviewsAdapter } from '@/api/reviews.types';

/**
 * 후기 진입점.
 * 화면과 저장소는 항상 `reviewsApi`만 호출한다.
 */
export const reviewsApi: ReviewsAdapter =
  backendMode === 'supabase' ? supabaseReviewsAdapter : mockReviewsAdapter;
