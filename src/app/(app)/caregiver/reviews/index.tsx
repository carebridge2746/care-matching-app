import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { ReviewList } from '@/components/care';
import { AppText, LoadingView, Screen } from '@/components/common';
import { useAuthStore } from '@/store/use-auth-store';
import { useReviewsStore } from '@/store/use-reviews-store';

/**
 * 받은 후기와 신고.
 *
 * 프로필 수정 화면에서 떼어 냈다. 거기에 두면 신고 폼을 채우는 동안에도 화면 아래 고정 버튼이
 * "프로필 저장"이라, 신고를 보낸다고 생각하고 그 버튼을 누르게 된다.
 */
export default function CaregiverReviewsScreen() {
  const caregiverId = useAuthStore((state) => state.user?.id);

  const rating = useReviewsStore((state) => state.rating);
  const received = useReviewsStore((state) => state.received);
  const reports = useReviewsStore((state) => state.reports);
  const isLoading = useReviewsStore((state) => state.isLoading);
  const loadedUserId = useReviewsStore((state) => state.loadedUserId);
  const reportingReviewId = useReviewsStore((state) => state.reportingReviewId);
  const errorMessage = useReviewsStore((state) => state.errorMessage);
  const load = useReviewsStore((state) => state.load);
  const report = useReviewsStore((state) => state.report);

  // 관리자가 신고를 처리했을 수 있으므로 돌아올 때마다 다시 불러온다
  useFocusEffect(
    useCallback(() => {
      if (caregiverId) {
        void load(caregiverId);
      }
    }, [caregiverId, load])
  );

  if (!caregiverId) {
    return null;
  }
  // 처음 불러오는 동안에만 로딩을 보여 준다. 다시 불러올 때는 보던 목록을 그대로 둔다.
  if (isLoading && loadedUserId !== caregiverId) {
    return <LoadingView message="받은 후기를 불러오는 중입니다" />;
  }

  return (
    <Screen scroll avoidKeyboard edges={['bottom']}>
      <AppText variant="body" tone="secondary">
        보호자가 남긴 후기입니다. 작성자 이름은 성만 보입니다. 욕설이나 사실과 다른 내용이 있으면
        신고해 주세요 — 운영자가 확인한 뒤 삭제 여부를 정합니다.
      </AppText>

      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}

      <ReviewList
        rating={rating}
        reviews={received}
        reports={reports}
        reportingReviewId={reportingReviewId}
        onReport={(reviewId, input) => report(reviewId, caregiverId, input)}
        emptyMessage="간병을 마치면 보호자가 남긴 후기가 여기에 쌓입니다."
      />
    </Screen>
  );
}
