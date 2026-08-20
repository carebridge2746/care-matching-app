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
