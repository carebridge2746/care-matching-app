import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { TextField } from '@/components/common/text-field';
import { Spacing } from '@/theme';
import { type CareMatch, type MatchParty } from '@/types';

export type MatchCancelFormProps = {
  match: CareMatch;
  /** 취소를 누른 사람이 어느 쪽인지. 안내 문구가 이 값으로 갈린다. */
  viewer: MatchParty;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onDismiss: () => void;
};

/**
 * 간병 취소 확인.
 *
 * 취소는 되돌릴 수 없고 상대의 일정에 그대로 영향을 주므로 한 번 더 묻는다.
 * 시작 전과 시작한 뒤의 결과가 다르기 때문에, 무엇이 일어나는지 그 자리에서 알려 준다.
 *
 * 사유는 받아 두되 비워도 넘어간다. 급한 사정으로 취소하는 사람을 입력 앞에 세워 두지 않는다.
 * 남긴 사유는 상대에게 그대로 보이고, 노쇼·대체 간병인(Phase 10)이 이 기록을 입력으로 쓴다.
 */
export function MatchCancelForm({
  match,
  viewer,
  busy = false,
  onConfirm,
  onDismiss,
}: MatchCancelFormProps) {
  const [reason, setReason] = useState('');
  const hasStarted = match.status === 'inProgress';

  return (
    <Card>
      <AppText variant="heading">이 간병을 취소할까요?</AppText>
      <AppText variant="body" tone="secondary">
        {hasStarted
          ? '이미 시작한 간병이므로 요청도 함께 종료됩니다. 새 간병인이 필요하시면 요청을 다시 올려 주세요.'
          : viewer === 'guardian'
            ? '요청은 다시 대기중으로 돌아가 다른 간병인이 수락할 수 있습니다.'
            : '요청은 다시 대기중으로 돌아가고, 다른 간병인이 이 요청을 수락할 수 있습니다.'}
      </AppText>

      <TextField
        label="취소 사유 (선택)"
        value={reason}
        onChangeText={setReason}
        placeholder="상대방에게 전할 사유가 있으면 적어 주세요"
        multiline
        editable={!busy}
      />

      <View style={styles.actions}>
        <AppButton
          title="네, 취소합니다"
          variant="danger"
          style={styles.action}
          loading={busy}
          disabled={busy}
          onPress={() => onConfirm(reason)}
        />
        <AppButton
          title="그대로 두기"
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
