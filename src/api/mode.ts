/**
 * 백엔드 모드.
 *
 * 인증뿐 아니라 환자·간병 요청 같은 데이터 접근도 같은 스위치를 따른다.
 * 인증만 Supabase로 붙이고 데이터는 로컬에 두는 식으로 섞이면
 * "로그인한 사용자의 데이터"가 두 곳에 나뉘어 앞뒤가 맞지 않기 때문이다.
 *
 * 환경 변수는 번들 시점에 값이 박히므로, 바꾼 뒤에는 개발 서버를 다시 시작해야 한다.
 */

export type BackendMode = 'mock' | 'supabase';

export const backendMode: BackendMode =
  process.env.EXPO_PUBLIC_AUTH_MODE === 'supabase' ? 'supabase' : 'mock';

export const isMockBackend = backendMode === 'mock';

/**
 * AI 호출 방식.
 *
 * 백엔드 모드와 따로 둔다. Supabase 로 붙였더라도 Edge Function 배포나 API Key 설정이
 * 끝나기 전에는 AI 없이 굴러가야 하고, 반대로 AI 응답만 흉내 내면서 나머지는 실제
 * 데이터베이스로 확인하고 싶은 때도 있기 때문이다.
 *
 * live 로 두려면 Supabase 프로젝트에 structure-care-request 함수가 배포되어 있고
 * ANTHROPIC_API_KEY 가 secret 으로 들어가 있어야 한다.
 */
export type LlmMode = 'mock' | 'live';

export const llmMode: LlmMode = process.env.EXPO_PUBLIC_LLM_MODE === 'live' ? 'live' : 'mock';

export const isMockLlm = llmMode === 'mock';
