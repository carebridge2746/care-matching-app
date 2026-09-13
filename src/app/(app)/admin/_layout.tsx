import { Stack } from 'expo-router';

import { StackScreenOptions } from '@/lib/navigation';

/** 관리자 화면 묶음 — 홈, 후기 신고, 분쟁 매칭, 조치 기록 */
export default function AdminLayout() {
  return (
    <Stack screenOptions={StackScreenOptions}>
      <Stack.Screen name="index" options={{ title: '관리자 홈' }} />
      <Stack.Screen name="reports/index" options={{ title: '후기 신고' }} />
      <Stack.Screen name="matches/index" options={{ title: '확인이 필요한 매칭' }} />
      <Stack.Screen name="actions/index" options={{ title: '조치 기록' }} />
    </Stack>
  );
}
