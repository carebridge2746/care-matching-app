import { StyleSheet, Text, type TextProps } from 'react-native';

import { Colors, FontFamily, Typography, type TypographyVariant } from '@/theme';

type TextTone = 'primary' | 'secondary' | 'tertiary' | 'inverse' | 'brand' | 'danger' | 'success';

const ToneColors: Record<TextTone, string> = {
  primary: Colors.text.primary,
  secondary: Colors.text.secondary,
  tertiary: Colors.text.tertiary,
  inverse: Colors.text.inverse,
  brand: Colors.brand.primary,
  danger: Colors.feedback.error,
  success: Colors.feedback.success,
};

export type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  tone?: TextTone;
  center?: boolean;
};

/**
 * 앱의 모든 텍스트는 이 컴포넌트를 통해 렌더링한다.
 * 글자 크기와 색상을 토큰으로만 지정하도록 강제하기 위한 래퍼다.
 */
export function AppText({
  variant = 'body',
  tone = 'primary',
  center = false,
  style,
  ...rest
}: AppTextProps) {
  return (
    <Text
      style={[
        styles.base,
        Typography[variant],
        { color: ToneColors[tone] },
        center && styles.center,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily: FontFamily,
  },
  center: {
    textAlign: 'center',
  },
});
