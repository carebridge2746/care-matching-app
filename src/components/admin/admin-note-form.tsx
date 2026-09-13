import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { TextField } from '@/components/common/text-field';
import { Spacing } from '@/theme';

export type AdminNoteFormProps = {
  title: string;
  /** 누르면 무슨 일이 일어나는지. 한 줄에 하나씩 보여 준다. */
  consequences: string[];
  noteLabel: string;
  notePlaceholder: string;
  confirmTitle: string;
  /** 되돌리기 어려운 조치는 danger 로 둔다 */
  confirmVariant?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: (note: string) => void;
  onDismiss: () => void;
};

/**
 * 관리자 조치 확인.
 *
 * 저장소는 메모를 비워도 받지만 화면에서는 반드시 적게 한다. 조치한 자리에는 결과만
 * 남고 판단은 조치 기록에만 남는데, 메모가 비어 있으면 나중에 그 기록을 읽어도
 * 왜 그랬는지 알 수 없다.
 */
export function AdminNoteForm({
  title,
  consequences,
  noteLabel,
  notePlaceholder,
  confirmTitle,
  confirmVariant = 'primary',
  busy = false,
  onConfirm,
  onDismiss,
}: AdminNoteFormProps) {
  const [note, setNote] = useState('');
  const canConfirm = note.trim().length > 0 && !busy;

  return (
    <Card>
      <AppText variant="heading">{title}</AppText>
      <AppText variant="body" tone="secondary">
        {consequences.map((line) => `· ${line}`).join('\n')}
      </AppText>

      <TextField
        label={noteLabel}
        value={note}
        onChangeText={setNote}
        placeholder={notePlaceholder}
        helperText="조치 기록에 함께 남습니다. 당사자에게는 보이지 않습니다."
        multiline
        editable={!busy}
      />

      <View style={styles.actions}>
        <AppButton
          title={confirmTitle}
          variant={confirmVariant}
          style={styles.action}
          loading={busy}
          disabled={!canConfirm}
          onPress={() => onConfirm(note)}
        />
        <AppButton
          title="닫기"
          variant="outline"
          style={styles.action}
          disabled={busy}
          onPress={onDismiss}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  action: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
});
