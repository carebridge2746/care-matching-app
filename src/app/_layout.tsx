import { Stack } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { LoadingView } from '@/components/common';
import { StackScreenOptions } from '@/lib/navigation';
import { useAuthStore } from '@/store/use-auth-store';

/**
 * 앱 루트 레이아웃.
 *
 * 저장된 세션을 먼저 복원한 뒤, 로그인 여부에 따라 볼 수 있는 화면 그룹을 나눈다.
 * - 비로그인: (auth) — 로그인 / 회원가입
 * - 로그인:   (app)  — 사용자 유형별 화면
 *
 * 화면 이동을 코드로 밀어 넣지 않고 `Stack.Protected`의 guard로만 제어한다.
 * 로그인/로그아웃으로 guard가 바뀌면 라우터가 접근 가능한 첫 화면인 index로 돌아가고,
 * index가 사용자 유형에 맞는 화면으로 다시 보낸다.
 */
export default function RootLayout() {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return (
    <SafeAreaProvider>
      {/* 웹 브라우저 탭에 보이는 이름. 비워 두면 주소(localhost:8081)가 대신 뜬다. */}
      <Head>
        <title>AI 간병 매칭</title>
      </Head>
      <StatusBar style="dark" />
      {isBootstrapping ? (
        <LoadingView message="로그인 정보를 확인하는 중입니다" />
      ) : (
        <Stack screenOptions={StackScreenOptions}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Protected guard={user === null}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={user !== null}>
            <Stack.Screen name="(app)" options={{ headerShown: false }} />
          </Stack.Protected>
        </Stack>
      )}
    </SafeAreaProvider>
  );
}
