import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { AuthError } from '@/api/auth.types';
import type { Database } from '@/api/database.types';

/**
 * Supabase 클라이언트.
 *
 * 클라이언트를 모듈 로드 시점에 만들지 않고 처음 필요할 때 만든다.
 * Mock 모드로 실행할 때는 Supabase 환경 변수가 비어 있는데,
 * 그 상태에서 createClient를 호출하면 앱이 시작조차 못 하기 때문이다.
 */

const SupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

/**
 * 공개 키. Supabase가 새로 쓰는 이름(publishable)을 먼저 보고,
 * 기존 프로젝트의 이름(anon)도 그대로 받아들인다. 둘 다 공개해도 되는 키이며
 * 실제 접근 제어는 RLS가 담당한다.
 */
const SupabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** .env 설정이 끝났는지 확인할 때 사용한다 */
export const hasSupabaseEnv = Boolean(SupabaseUrl && SupabaseKey);

export type CareSupabaseClient = SupabaseClient<Database>;

let client: CareSupabaseClient | null = null;

export function getSupabaseClient(): CareSupabaseClient {
  if (client) {
    return client;
  }

  if (!SupabaseUrl || !SupabaseKey) {
    throw new AuthError(
      'not_configured',
      'Supabase 설정이 없습니다. .env 파일에 EXPO_PUBLIC_SUPABASE_URL 과 EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY 를 채운 뒤 앱을 다시 시작해 주세요.'
    );
  }

  client = createClient<Database>(SupabaseUrl, SupabaseKey, {
    auth: {
      // 로그인 세션을 기기에 저장해 앱을 껐다 켜도 유지되게 한다
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // 네이티브에는 세션이 담긴 URL이 없다. 웹에서는 메일 인증 링크로 돌아올 때 필요하다.
      detectSessionInUrl: Platform.OS === 'web',
    },
  });

  registerAutoRefresh(client);
  return client;
}

/**
 * 앱이 화면에 보이는 동안에만 토큰 갱신 타이머를 돌린다.
 * 백그라운드에서 계속 갱신하면 불필요한 요청과 배터리 소모가 생긴다.
 */
function registerAutoRefresh(instance: CareSupabaseClient): void {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      void instance.auth.startAutoRefresh();
    } else {
      void instance.auth.stopAutoRefresh();
    }
  });
}
