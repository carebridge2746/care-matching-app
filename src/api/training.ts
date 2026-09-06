import { backendMode } from '@/api/mode';
import { mockTrainingAdapter } from '@/api/training.mock';
import { supabaseTrainingAdapter } from '@/api/training.supabase';
import type { TrainingAdapter } from '@/api/training.types';

export type { TrainingAdapter } from '@/api/training.types';

/**
 * 교육 진입점.
 * 화면과 저장소는 항상 `trainingApi`만 호출한다.
 */
export const trainingApi: TrainingAdapter =
  backendMode === 'supabase' ? supabaseTrainingAdapter : mockTrainingAdapter;
