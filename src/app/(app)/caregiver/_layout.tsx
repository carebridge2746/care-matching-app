import { Stack } from 'expo-router';

import { StackScreenOptions } from '@/lib/navigation';

/** 간병인 화면 묶음 — 홈, 프로필·가능 시간, 요청 찾기·상세, 수락한 요청 */
export default function CaregiverLayout() {
  return (
    <Stack screenOptions={StackScreenOptions}>
      <Stack.Screen name="index" options={{ title: '간병인 홈' }} />
      <Stack.Screen name="profile/index" options={{ title: '프로필과 역량' }} />
      <Stack.Screen name="availability/index" options={{ title: '가능 시간' }} />
      <Stack.Screen name="requests/index" options={{ title: '간병 요청 찾기' }} />
      <Stack.Screen name="requests/[id]" options={{ title: '요청 상세' }} />
      <Stack.Screen name="accepted/index" options={{ title: '수락한 간병' }} />
    </Stack>
  );
}
