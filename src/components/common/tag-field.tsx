import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { TextField } from '@/components/common/text-field';
import { Colors, Layout, Radius, Spacing } from '@/theme';

export type TagFieldProps = {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  helperText?: string;
  error?: string | null;
  /** 더 넣을 수 없는 개수 */
  maxCount?: number;
};

/**
 * 자유 입력을 여러 개 모으는 필드 (근무 가능 지역 등).
 *
 * 지역은 정해진 목록으로 고르게 할 수 없다 — 보호자도 요청에 지역을 직접 적기 때문이다.
 * 대신 한 칸에 쉼표로 나열하게 두지 않고 한 개씩 넣게 한다.
 * 그래야 저장된 값이 '서울 강남구'처럼 하나의 지역으로 남고, 매칭에서 그대로 비교할 수 있다.
 */
export function TagField({
  label,
  values,
  onChange,
  placeholder,
  helperText,
  error,
  maxCount = 10,
}: TagFieldProps) {
  const [draft, setDraft] = useState('');

  const isFull = values.length >= maxCount;
  const trimmed = draft.trim();
  // 같은 값을 두 번 넣으면 매칭에서 같은 지역을 두 번 세게 된다
  const canAdd = Boolean(trimmed) && !values.includes(trimmed) && !isFull;

  const add = () => {
    if (!canAdd) {
      return;
    }
    onChange([...values, trimmed]);
    setDraft('');
  };

  return (
    <View style={styles.container}>
      <TextField
        label={label}
        value={draft}
        onChangeText={setDraft}
        placeholder={placeholder}
        error={error}
        helperText={isFull ? `${maxCount}개까지 넣을 수 있습니다.` : helperText}
        editable={!isFull}
        returnKeyType="done"
        onSubmitEditing={add}
      />

      <AppButton
        title="추가"
        variant="outline"
        onPress={add}
        disabled={!canAdd}
        style={styles.addButton}
      />

      {values.length > 0 ? (
        <View style={styles.tags}>
          {values.map((value) => (
            <Pressable
              key={value}
              accessibilityRole="button"
              accessibilityLabel={`${value} 지우기`}
              onPress={() => onChange(values.filter((item) => item !== value))}
              style={({ pressed }) => [styles.tag, pressed && styles.pressed]}>
              <AppText variant="body">{value} ✕</AppText>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  addButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.xl,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tag: {
    minHeight: Layout.minTouchHeight,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.pill,
    borderWidth: Layout.borderWidth,
    borderColor: Colors.brand.primary,
    backgroundColor: Colors.brand.primarySoft,
  },
  pressed: {
    opacity: 0.85,
  },
});
