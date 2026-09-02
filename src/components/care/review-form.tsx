import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { StarRating } from '@/components/common/star-rating';
import { TextField } from '@/components/common/text-field';
import { Spacing } from '@/theme';
import { MinRating, type MatchParty, type ReviewInput } from '@/types';

export type ReviewFormProps = {
  /** 후기를 쓰는 사람이 어느 쪽인지. 안내 문구가 이 값으로 갈린다. */
  viewer: MatchParty;
  /** 평가받는 상대의 이름 */
  counterpartName: string;
  busy?: boolean;
  onSubmit: (input: ReviewInput) => void;
  onDismiss: () => void;
};

/**
 * 후기 작성.
 *
 * 별점만 필수이고 코멘트는 비워도 된다. 한 줄이라도 적게 하려고 입력을 막아 두면
 * 대부분은 아무것도 남기지 않고 화면을 닫는다. 별점만이라도 쌓이는 편이 낫다.
 *
 * 한번 남긴 후기는 고칠 수 없으므로, 저장 전에 그 사실을 미리 알려 준다.
 */
export function ReviewForm({
  viewer,
  counterpartName,
  busy = false,
  onSubmit,
  onDismiss,
}: ReviewFormProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');

  const canSubmit = rating >= MinRating && !busy;

  return (
    <Card>
      <AppText variant="heading">
        {counterpartName} {viewer === 'guardian' ? '간병인' : '보호자'}님은 어떠셨나요?
      </AppText>
      <AppText variant="body" tone="secondary">
        {viewer === 'guardian'
          ? '남기신 평가는 다른 보호자가 간병인을 고를 때 참고합니다.'
          : '남기신 평가는 다른 간병인이 요청을 고를 때 참고합니다.'}
      </AppText>

      <StarRating value={rating} onChange={setRating} showLabel disabled={busy} />

      <TextField
        label="후기 (선택)"
        value={comment}
        onChangeText={setComment}
        placeholder="어떤 점이 좋았는지, 아쉬웠는지 적어 주세요"
        multiline
        editable={!busy}
      />

      <AppText variant="caption" tone="tertiary">
        남기신 후기는 고치거나 지울 수 없습니다. 이름은 성만 공개됩니다.
      </AppText>

      <View style={styles.actions}>
        <AppButton
          title="후기 남기기"
          style={styles.action}
          loading={busy}
          disabled={!canSubmit}
          onPress={() => onSubmit({ rating, ...(comment.trim() ? { comment } : {}) })}
        />
        <AppButton
          title="다음에"
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
