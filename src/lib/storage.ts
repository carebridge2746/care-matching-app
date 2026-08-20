import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * AsyncStorage 위에 얹은 얇은 JSON 헬퍼.
 *
 * Mock 인증이 사용자 목록과 세션을 저장하는 용도로 쓰고,
 * Supabase 연동 이후에는 Supabase 클라이언트의 세션 저장소로도 같은 저장소를 쓴다.
 * 값이 깨졌거나 읽기에 실패하면 앱을 멈추는 대신 null로 취급한다.
 */
export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function removeKey(key: string): Promise<void> {
  await AsyncStorage.removeItem(key);
}
