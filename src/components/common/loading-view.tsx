import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/app-text';
import { Colors, Spacing } from '@/theme';

export type LoadingViewProps = {
  /** 무엇을 기다리는 중인지 알려주는 문구 */
  message?: string;
};

/** 세션 확인처럼 화면 전체가 대기 상태일 때 쓰는 표시 */
export function LoadingView({ message = '불러오는 중입니다' }: LoadingViewProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.brand.primary} />
      <AppText variant="body" tone="secondary">
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.lg,
    backgroundColor: Colors.surface.background,
  },
});
