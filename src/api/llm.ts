import { mockLlmAdapter } from '@/api/llm.mock';
import { supabaseLlmAdapter } from '@/api/llm.supabase';
import type { LlmAdapter } from '@/api/llm.types';
import { llmMode } from '@/api/mode';

export type { LlmAdapter } from '@/api/llm.types';

/**
 * AI 진입점.
 * 화면과 저장소는 항상 `llmApi`만 호출한다.
 *
 * 인증·데이터와 달리 EXPO_PUBLIC_LLM_MODE 로 따로 고른다 —
 * Supabase 로 붙였더라도 Edge Function 배포 전에는 Mock 으로 굴러가야 하기 때문이다.
 */
export const llmApi: LlmAdapter = llmMode === 'live' ? supabaseLlmAdapter : mockLlmAdapter;
