import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ReviewList } from '@/components/care/review-list';
import type { PublicReview, ReviewReport } from '@/types';

const reviews: PublicReview[] = [
  { id: 'review-1', rating: 1, comment: '불친절했습니다', createdAt: '2026-09-01T03:00:00.000Z', reviewerName: '김OO' },
  { id: 'review-2', rating: 5, createdAt: '2026-09-02T03:00:00.000Z', reviewerName: '박OO' },
];

const rating = { ratingAvg: 3, reviewCount: 2 };

function report(reviewId: string, status: ReviewReport['status']): ReviewReport {
  return { id: `report-${reviewId}`, reviewId, reason: 'abuse', status, createdAt: '2026-09-03T03:00:00.000Z' };
}

describe('ReviewList', () => {
  it('신고 창구를 주지 않으면 신고 버튼이 없다', () => {
    render(<ReviewList rating={rating} reviews={reviews} emptyMessage="없음" />);
    expect(screen.queryByRole('button', { name: '이 후기 신고하기' })).toBeNull();
  });

  it('후기가 없으면 0점이 아니라 그 사실을 그대로 말한다', () => {
    render(<ReviewList rating={{ reviewCount: 0 }} reviews={[]} emptyMessage="간병을 마치면 후기가 쌓입니다." />);
    expect(screen.getByText('아직 받은 후기 없음')).toBeOnTheScreen();
    expect(screen.getByText('간병을 마치면 후기가 쌓입니다.')).toBeOnTheScreen();
  });

  it('이미 신고한 후기에는 버튼 대신 처리 상태가 붙는다', () => {
    render(
      <ReviewList
        rating={rating}
        reviews={reviews}
        emptyMessage="없음"
        reports={[report('review-1', 'open')]}
        onReport={jest.fn()}
      />
    );

    expect(screen.getByText('신고하셨습니다 · 확인 중')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: '이 후기 신고하기' })).toHaveLength(1);
  });

  it('받아들여진 신고의 후기가 목록에서 빠졌으면 한 줄로 알려 준다', () => {
    render(
      <ReviewList
        rating={rating}
        reviews={reviews}
        emptyMessage="없음"
        reports={[report('review-gone', 'accepted'), report('review-1', 'dismissed')]}
        onReport={jest.fn()}
      />
    );

    expect(screen.getByText(/신고하신 후기 1건이 확인을 거쳐 삭제되었습니다/)).toBeOnTheScreen();
    expect(screen.getByText('신고하셨습니다 · 반려됨')).toBeOnTheScreen();
  });

  it('신고가 받아들여지면 폼을 닫고, 실패하면 적은 내용이 남도록 열어 둔다', async () => {
    const onReport = jest.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<ReviewList rating={rating} reviews={reviews} emptyMessage="없음" onReport={onReport} />);

    fireEvent.press(screen.getAllByRole('button', { name: '이 후기 신고하기' })[0]!);
    fireEvent.press(screen.getByRole('radio', { name: '광고나 도배' }));
    fireEvent.press(screen.getByRole('button', { name: '신고하기' }));

    await waitFor(() => expect(onReport).toHaveBeenCalledWith('review-1', { reason: 'spam' }));
    expect(screen.getByText('이 후기를 신고할까요?')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: '신고하기' }));
    await waitFor(() => expect(onReport).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByText('이 후기를 신고할까요?')).toBeNull());
  });
});
