import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors, FontFamily, Typography } from '@/theme';

/**
 * 앱 루트 레이아웃.
 *
 * 역할별 화면 그룹((auth)/(guardian)/(caregiver)/(admin))은
 * Phase 2에서 이 Stack 아래에 추가한다.
 */
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: Colors.surface.card },
          headerTitleStyle: {
            fontSize: Typography.subheading.fontSize,
            fontWeight: Typography.subheading.fontWeight,
            fontFamily: FontFamily,
            color: Colors.text.primary,
          },
          headerTintColor: Colors.brand.primary,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: Colors.surface.background },
        }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
