import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Colors, Layout, Spacing } from '@/theme';

export type ScreenProps = {
  children: ReactNode;
  /** 내용이 화면보다 길어질 수 있으면 true */
  scroll?: boolean;
  /** 헤더가 있는 화면은 ['bottom']만 넘겨 상단 중복 여백을 피한다 */
  edges?: readonly Edge[];
  /** 하단에 고정 버튼을 둘 때 사용 */
  footer?: ReactNode;
  /** 입력 폼이 있는 화면에서 키보드가 하단 버튼을 가리지 않게 한다 */
  avoidKeyboard?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * 모든 화면의 바깥 껍데기.
 * 안전 영역, 좌우 여백, 최대 너비를 한 곳에서 관리한다.
 */
export function Screen({
  children,
  scroll = false,
  edges = ['top', 'bottom'],
  footer,
  avoidKeyboard = false,
  contentStyle,
}: ScreenProps) {
  const content = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, styles.content, contentStyle]}>{children}</View>
  );

  const column = (
    <View style={styles.centerColumn}>
      {content}
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={edges}>
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.select({ ios: 'padding', default: undefined })}>
          {column}
        </KeyboardAvoidingView>
      ) : (
        column
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.surface.background,
  },
  centerColumn: {
    flex: 1,
    width: '100%',
    maxWidth: Layout.maxContentWidth,
    alignSelf: 'center',
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  footer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
    borderTopWidth: Layout.borderWidth,
    borderTopColor: Colors.surface.divider,
    backgroundColor: Colors.surface.background,
    gap: Spacing.sm,
  },
});
