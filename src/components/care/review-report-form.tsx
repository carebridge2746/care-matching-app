import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { ChoiceGroup, type ChoiceOption } from '@/components/common/choice-group';
import { TextField } from '@/components/common/text-field';
import { Spacing } from '@/theme';
import {
  ReviewReportReasonLabels,
  ReviewReportReasons,
  type ReviewReportInput,
  type ReviewReportReason,
} from '@/types';

const ReasonOptions: ChoiceOption<ReviewReportReason>[] = ReviewReportReasons.map((reason) => ({
  value: reason,
  label: ReviewReportReasonLabels[reason],
}));

export type ReviewReportFormProps = {
  busy?: boolean;
  onSubmit: (input: ReviewReportInput) => void;
  onDismiss: () => void;
};

/**
 * 후기 신고.
 *
 * 사유는 반드시 고르게 한다. 관리자가 무엇을 확인해야 하는지가 사유마다 다르다 —
 * 욕설은 문장만 읽으면 되지만, 사실과 다르다는 신고는 간병 기록까지 봐야 한다.
 * 설명은 비워도 넘어간다.
 *
 * 신고한다고 후기가 곧바로 사라지지 않는다는 것을 먼저 말한다. 누르자마자 지워질 거라
 * 생각한 사람은 후기가 그대로 남아 있는 것을 보고 신고가 안 된 줄 안다.
 */
export function ReviewReportForm({ busy = false, onSubmit, onDismiss }: ReviewReportFormProps) {
  const [reason, setReason] = useState<ReviewReportReason | null>(null);
  const [detail, setDetail] = useState('');

  return (
    <Card>
      <AppText variant="heading">이 후기를 신고할까요?</AppText>
      <AppText variant="body" tone="secondary">
        운영자가 내용을 확인한 뒤 삭제 여부를 정합니다. 확인이 끝날 때까지 후기는 그대로
        보입니다. 신고하신 사실은 후기를 쓴 분께 알리지 않습니다.
      </AppText>

      <ChoiceGroup
        label="신고 사유"
        options={ReasonOptions}
        value={reason}
        onChange={setReason}
      />

      <TextField
        label="자세한 설명 (선택)"
        value={detail}
        onChangeText={setDetail}
        placeholder="어느 부분이 문제인지 적어 주시면 확인이 빨라집니다"
        multiline
        editable={!busy}
      />

      <AppText variant="caption" tone="tertiary">
        같은 후기는 한 번만 신고할 수 있습니다.
      </AppText>

      <View style={styles.actions}>
        <AppButton
          title="신고하기"
          variant="danger"
          style={styles.action}
          loading={busy}
          disabled={!reason || busy}
          onPress={() => {
            if (reason) {
              onSubmit({ reason, ...(detail.trim() ? { detail } : {}) });
            }
          }}
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
