import { Stack } from 'expo-router';

import { StackScreenOptions } from '@/lib/navigation';
import { useAuthStore } from '@/store/use-auth-store';

/**
 * 로그인한 사용자만 접근할 수 있는 화면 묶음.
 *
 * 유형이 다른 사용자는 다른 유형의 화면을 아예 열 수 없다.
 * 주소를 직접 입력해 들어오는 경우(웹/딥링크)도 guard가 막는다.
 *
 * 세 유형 모두 하위 화면이 있어서 각자 Stack(guardian/_layout, caregiver/_layout, admin/_layout)을 가진다.
 */
export default function AppLayout() {
  const role = useAuthStore((state) => state.user?.role);

  return (
    <Stack screenOptions={StackScreenOptions}>
      <Stack.Protected guard={role === 'guardian'}>
        <Stack.Screen name="guardian" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={role === 'caregiver'}>
        <Stack.Screen name="caregiver" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={role === 'admin'}>
        <Stack.Screen name="admin" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}
