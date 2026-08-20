import { Stack } from 'expo-router';

import { StackScreenOptions } from '@/lib/navigation';

/** 비로그인 상태에서만 접근할 수 있는 화면 묶음 */
export default function AuthLayout() {
  return (
    <Stack screenOptions={StackScreenOptions}>
      <Stack.Screen name="sign-in" options={{ title: '로그인' }} />
      <Stack.Screen name="sign-up" options={{ title: '회원가입' }} />
    </Stack>
  );
}
