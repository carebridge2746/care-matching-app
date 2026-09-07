import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { TextField } from '@/components/common/text-field';
import { formatKoreanDate } from '@/lib/date';
import { Spacing } from '@/theme';
import type { CareMatch } from '@/types';

export type NoShowFormProps = {
  match: CareMatch;
  busy?: boolean;
  onConfirm: (note: string) => void;
  onDismiss: () => void;
};

/**
 * 노쇼 신고 확인.
 *
 * 신고는 상대의 기록에 남고 되돌릴 수 없다. 그래서 무엇이 일어나는지 —
 * 요청이 다시 열린다는 것과, 그 간병인은 이 요청을 다시 맡을 수 없다는 것 — 을
 * 누르기 전에 그대로 알려 준다.
 *
 * "연락이 닿았는지 먼저 확인해 주세요"를 앞에 둔다. 늦는 것과 오지 않는 것은 다르고,
 * 잘못 눌린 신고는 되돌릴 수 없기 때문이다.
 *
 * 상황 설명은 받아 두되 비워도 넘어간다. 사람이 오지 않아 급한 보호자를
 * 입력 앞에 세워 두지 않는다.
 */
export function NoShowForm({ match, busy = false, onConfirm, onDismiss }: NoShowFormProps) {
  const [note, setNote] = useState('');

  return (
    <Card>
      <AppText variant="heading">간병인이 오지 않았나요?</AppText>
      <AppText variant="body" tone="secondary">
        {formatKoreanDate(match.care.startDate)}부터 시작하기로 한 간병입니다. 신고하시기 전에
        {' '}{match.caregiver.name} 간병인께 연락이 닿는지 한 번 확인해 주세요 — 늦는 것과 오지
        않는 것은 다릅니다.
      </AppText>

      <AppText variant="body">신고하시면</AppText>
      <AppText variant="body" tone="secondary">
        · 요청이 곧바로 다시 대기중이 되어 다른 간병인이 수락할 수 있습니다{'\n'}· 이 간병인은
        이 요청을 다시 맡을 수 없고 추천 목록에서도 빠집니다{'\n'}· 기록은 되돌릴 수 없습니다
      </AppText>

      <TextField
        label="상황 설명 (선택)"
        value={note}
        onChangeText={setNote}
        placeholder="연락이 닿지 않았는지, 어떤 이야기가 있었는지 적어 주세요"
        multiline
        editable={!busy}
      />

      <View style={styles.actions}>
        <AppButton
          title="오지 않았습니다"
          variant="danger"
          style={styles.action}
          loading={busy}
          disabled={busy}
          onPress={() => onConfirm(note)}
        />
        <AppButton
          title="더 기다리기"
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
