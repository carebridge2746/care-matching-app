import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { formatKoreanTimestamp } from '@/lib/date';
import { AdminActionLabels, type AdminAction, type AdminActionTargetType } from '@/types';

const TargetLabels: Record<AdminActionTargetType, string> = {
  review: '후기',
  reviewReport: '신고',
  match: '매칭',
};

export type AdminActionItemProps = {
  action: AdminAction;
};

/**
 * 조치 기록 한 줄.
 *
 * 대상 id 를 줄여서라도 보여 준다. 같은 후기를 지웠다가 되돌린 일은
 * id 가 같다는 것으로만 이어 읽을 수 있다.
 */
export function AdminActionItem({ action }: AdminActionItemProps) {
  return (
    <Card>
      <AppText variant="subheading">{AdminActionLabels[action.action]}</AppText>
      <AppText variant="caption" tone="secondary">
        {formatKoreanTimestamp(action.createdAt)} · {TargetLabels[action.targetType]}{' '}
        {action.targetId.slice(-8)}
        {action.adminId ? '' : ' · 탈퇴한 관리자'}
      </AppText>
      <AppText variant="body" tone={action.note ? 'primary' : 'tertiary'}>
        {action.note ?? '(남긴 메모 없음)'}
      </AppText>
    </Card>
  );
}
