import { Stack } from 'expo-router';

import { StackScreenOptions } from '@/lib/navigation';

/** 간병인 화면 묶음 — 홈, 프로필·받은 후기·가능 시간, 요청 찾기·상세, 수락한 요청, 교육 */
export default function CaregiverLayout() {
  return (
    <Stack screenOptions={StackScreenOptions}>
      <Stack.Screen name="index" options={{ title: '간병인 홈' }} />
      <Stack.Screen name="profile/index" options={{ title: '프로필과 역량' }} />
      <Stack.Screen name="reviews/index" options={{ title: '받은 후기' }} />
      <Stack.Screen name="availability/index" options={{ title: '가능 시간' }} />
      <Stack.Screen name="requests/index" options={{ title: '간병 요청 찾기' }} />
      <Stack.Screen name="requests/[id]" options={{ title: '요청 상세' }} />
      <Stack.Screen name="accepted/index" options={{ title: '수락한 간병' }} />
      <Stack.Screen name="training/index" options={{ title: '교육과 수료' }} />
      {/* 과정 이름은 화면이 열린 뒤에야 알 수 있어서 제목을 고정해 둔다 */}
      <Stack.Screen name="training/[id]" options={{ title: '교육 과정' }} />
    </Stack>
  );
}
