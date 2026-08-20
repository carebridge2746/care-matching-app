import { useState } from 'react';
import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from '@/components/common/app-text';
import { Colors, FontFamily, Layout, Radius, Spacing, Typography } from '@/theme';

export type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** 검증 실패 문구. 값이 있으면 테두리와 안내 문구가 오류 상태로 바뀐다 */
  error?: string | null;
  /** 입력 규칙 안내 (예: 8자 이상). 오류가 있으면 오류 문구로 대체된다 */
  helperText?: string;
  secureTextEntry?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoComplete?: TextInputProps['autoComplete'];
  textContentType?: TextInputProps['textContentType'];
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  editable?: boolean;
};

/**
 * 라벨과 오류 문구를 함께 가지는 입력 필드.
 *
 * 고령 사용자를 고려해 입력 글자도 본문과 같은 18px을 쓰고,
 * 오류는 색상만이 아니라 문장으로도 알린다.
 */
export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  helperText,
  secureTextEntry = false,
  keyboardType,
  autoCapitalize = 'none',
  autoComplete,
  textContentType,
  returnKeyType,
  onSubmitEditing,
  editable = true,
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const description = error ?? helperText;

  return (
    <View style={styles.container}>
      <AppText variant="label" tone="secondary">
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={Colors.text.tertiary}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoComplete={autoComplete}
        textContentType={textContentType}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        editable={editable}
        autoCorrect={false}
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          !editable && styles.inputDisabled,
        ]}
      />
      {description ? (
        <AppText variant="caption" tone={error ? 'danger' : 'tertiary'}>
          {description}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.xs,
  },
  input: {
    minHeight: Layout.minTouchHeight,
    borderRadius: Radius.md,
    borderWidth: Layout.borderWidth,
    borderColor: Colors.surface.border,
    backgroundColor: Colors.surface.card,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontFamily: FontFamily,
    fontSize: Typography.body.fontSize,
    lineHeight: Typography.body.lineHeight,
    color: Colors.text.primary,
  },
  inputFocused: {
    borderColor: Colors.brand.primary,
  },
  inputError: {
    borderColor: Colors.feedback.error,
  },
  inputDisabled: {
    backgroundColor: Colors.surface.subtle,
    color: Colors.text.disabled,
  },
});
