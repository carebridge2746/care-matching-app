import { Stack } from 'expo-router';

import { StackScreenOptions } from '@/lib/navigation';

/** 보호자 화면 묶음 — 홈, 환자 관리, 간병 요청, 간병 진행, 받은 후기 */
export default function GuardianLayout() {
  return (
    <Stack screenOptions={StackScreenOptions}>
      <Stack.Screen name="index" options={{ title: '보호자 홈' }} />
      <Stack.Screen name="patients/index" options={{ title: '환자 관리' }} />
      <Stack.Screen name="patients/new" options={{ title: '환자 등록' }} />
      <Stack.Screen name="requests/index" options={{ title: '간병 요청' }} />
      <Stack.Screen name="requests/[id]" options={{ title: '요청과 추천 간병인' }} />
      <Stack.Screen name="requests/new" options={{ title: '간병 요청 작성' }} />
      <Stack.Screen name="matches/index" options={{ title: '간병 진행' }} />
      <Stack.Screen name="reviews/index" options={{ title: '받은 후기' }} />
    </Stack>
  );
}
