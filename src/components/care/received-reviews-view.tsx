import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { ReviewList } from '@/components/care/review-list';
import { AppText } from '@/components/common/app-text';
import { LoadingView } from '@/components/common/loading-view';
import { Screen } from '@/components/common/screen';
import { useReviewsStore } from '@/store/use-reviews-store';

export type ReceivedReviewsViewProps = {
  userId: string;
  /** 누가 남긴 후기인지 알려 주는 첫 문장. 보호자와 간병인 화면이 다르다. */
  intro: string;
  emptyMessage: string;
};

/**
 * 받은 후기와 신고 — 보호자와 간병인이 같은 화면을 쓴다.
 *
 * 신고 자격은 후기의 당사자 두 사람 모두에게 열려 있으므로(report_review), 받은 후기를 볼 자리도
 * 양쪽에 있어야 한다. 다른 것은 안내 문장뿐이라 화면 몸통을 하나로 둔다.
 *
 * 프로필 수정처럼 아래 고정 버튼이 있는 화면에 두지 않는다. 신고 폼을 채우는 동안 아래 버튼을
 * 신고 보내기로 착각하게 된다.
 */
export function ReceivedReviewsView({ userId, intro, emptyMessage }: ReceivedReviewsViewProps) {
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
      void load(userId);
    }, [userId, load])
  );

  // 처음 불러오는 동안에만 로딩을 보여 준다. 다시 불러올 때는 보던 목록을 그대로 둔다.
  if (isLoading && loadedUserId !== userId) {
    return <LoadingView message="받은 후기를 불러오는 중입니다" />;
  }

  return (
    <Screen scroll avoidKeyboard edges={['bottom']}>
      <AppText variant="body" tone="secondary">
        {intro} 작성자 이름은 성만 보입니다. 욕설이나 사실과 다른 내용이 있으면 신고해 주세요 —
        운영자가 확인한 뒤 삭제 여부를 정합니다.
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
        onReport={(reviewId, input) => report(reviewId, userId, input)}
        emptyMessage={emptyMessage}
      />
    </Screen>
  );
}
