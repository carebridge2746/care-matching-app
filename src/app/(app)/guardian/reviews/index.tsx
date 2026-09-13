import { ReceivedReviewsView } from '@/components/care';
import { useAuthStore } from '@/store/use-auth-store';

/**
 * 보호자가 받은 후기와 신고.
 *
 * 간병인도 끝난 간병마다 보호자에게 후기를 남긴다. 그 후기는 다른 간병인이 요청을 고를 때
 * 참고하는 값이라, 보호자에게도 자기가 어떻게 보이는지 확인하고 부적절한 후기를 신고할 자리가 필요하다.
 */
export default function GuardianReviewsScreen() {
  const guardianId = useAuthStore((state) => state.user?.id);

  if (!guardianId) {
    return null;
  }

  return (
    <ReceivedReviewsView
      userId={guardianId}
      intro="간병인이 남긴 후기입니다."
      emptyMessage="간병을 마치면 간병인이 남긴 후기가 여기에 쌓입니다."
    />
  );
}
