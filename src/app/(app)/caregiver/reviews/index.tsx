import { ReceivedReviewsView } from '@/components/care';
import { useAuthStore } from '@/store/use-auth-store';

/**
 * 간병인이 받은 후기와 신고.
 *
 * 프로필 수정 화면에서 떼어 냈다. 거기에 두면 신고 폼을 채우는 동안에도 화면 아래 고정 버튼이
 * "프로필 저장"이라, 신고를 보낸다고 생각하고 그 버튼을 누르게 된다.
 */
export default function CaregiverReviewsScreen() {
  const caregiverId = useAuthStore((state) => state.user?.id);

  if (!caregiverId) {
    return null;
  }

  return (
    <ReceivedReviewsView
      userId={caregiverId}
      intro="보호자가 남긴 후기입니다."
      emptyMessage="간병을 마치면 보호자가 남긴 후기가 여기에 쌓입니다."
    />
  );
}
