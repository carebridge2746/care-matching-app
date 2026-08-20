import type { NativeStackNavigationOptions } from 'expo-router';

import { Colors, FontFamily, Typography } from '@/theme';

/**
 * 모든 Stack이 공유하는 헤더 스타일.
 * 루트/인증/앱 레이아웃이 각각 다른 헤더로 보이지 않도록 한 곳에서 정의한다.
 */
export const StackScreenOptions: NativeStackNavigationOptions = {
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
};
