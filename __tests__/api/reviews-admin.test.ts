import { mockAdminAdapter as admin } from '@/api/admin.mock';
import { mockCareRequestsAdapter as requests } from '@/api/care-requests.mock';
import { mockMatchHistoryAdapter as history } from '@/api/match-history.mock';
import { mockReviewsAdapter as reviews, readMockRatings } from '@/api/reviews.mock';

import {
  acceptRequest,
  Admin,
  Caregiver,
  daysFromToday,
  findMatch,
  Guardian,
  HomeCaregiver,
  NewCaregiver,
  seedCompletedMatch,
  seedRequest,
} from '../../test-utils/fixtures';

/** 보호자가 간병인에게 남긴 후기 한 건 */
async function seedGuardianReview() {
  const match = await seedCompletedMatch();
  const review = await reviews.create(match.id, Guardian, { rating: 1, comment: '불친절했습니다' });
  return { match, review };
}

/**
 * 받은 후기 수를 두 길로 센다 — 평균 조회(ratingOf)와 추천 목록이 쓰는 readMockRatings.
 * Supabase 쪽에서는 user_ratings · public_reviews() · recommendation_candidates() 가 짝이다.
 */
async function receivedCounts(userId: string): Promise<[number, number]> {
  const fromRating = (await reviews.ratingOf(userId)).reviewCount;
  const fromRecommendation = (await readMockRatings()).get(userId)?.reviewCount ?? 0;
  return [fromRating, fromRecommendation];
}

describe('후기 (Phase 8)', () => {
  it('끝난 간병에 한 번만 남기고, 받은 사람에게는 작성자 성만 보인다', async () => {
    const { match } = await seedGuardianReview();

    await expect(reviews.create(match.id, Guardian, { rating: 5 })).rejects.toMatchObject({ code: 'invalid_state' });

    const received = await reviews.listReceived(Caregiver);
    expect(received).toHaveLength(1);
    expect(received[0]?.reviewerName).toBe('김OO');
    expect(await reviews.ratingOf(Caregiver)).toEqual({ ratingAvg: 1, reviewCount: 1 });
  });

  it('끝나지 않은 간병에는 후기를 남길 수 없다', async () => {
    const request = await seedRequest();
    const match = await acceptRequest(request.id);
    await expect(reviews.create(match.id, Guardian, { rating: 5 })).rejects.toMatchObject({ code: 'invalid_state' });
  });
});

describe('후기 신고 (Phase 11)', () => {
  it('당사자 둘만 신고할 수 있고, 남에게는 후기가 없다고 답한다', async () => {
    const { review } = await seedGuardianReview();

    await expect(reviews.report(review.id, NewCaregiver, { reason: 'abuse' })).rejects.toMatchObject({
      code: 'not_found',
    });

    const byReviewee = await reviews.report(review.id, Caregiver, { reason: 'abuse', detail: '  욕설  ' });
    expect(byReviewee).toMatchObject({ status: 'open', detail: '욕설' });

    const byAuthor = await reviews.report(review.id, Guardian, { reason: 'other' });
    expect(byAuthor.status).toBe('open');

    expect((await reviews.listReports(Caregiver)).map((item) => item.id)).toEqual([byReviewee.id]);
  });

  it('같은 후기를 두 번 신고할 수 없다', async () => {
    const { review } = await seedGuardianReview();
    await reviews.report(review.id, Caregiver, { reason: 'abuse' });

    await expect(reviews.report(review.id, Caregiver, { reason: 'spam' })).rejects.toMatchObject({
      code: 'invalid_state',
    });
  });

  it('관리자 큐에는 이름을 가리지 않고, 같은 후기의 신고 수를 붙인다', async () => {
    const { review } = await seedGuardianReview();
    await reviews.report(review.id, Caregiver, { reason: 'abuse' });
    await reviews.report(review.id, Guardian, { reason: 'other' });

    const queue = await admin.listReports('open');

    expect(queue).toHaveLength(2);
    expect(queue.map((item) => item.reportCount)).toEqual([2, 2]);
    expect(queue[0]).toMatchObject({ reviewerName: '김영희', revieweeName: '이미영', comment: '불친절했습니다' });
  });
});

describe('관리자 후기 삭제와 복구 (Phase 11)', () => {
  it('지우면 평균·목록·추천 모두에서 빠지고, 열린 신고가 함께 마감된다', async () => {
    const { match, review } = await seedGuardianReview();
    await reviews.report(review.id, Caregiver, { reason: 'abuse' });
    await reviews.report(review.id, Guardian, { reason: 'other' });
    expect(await receivedCounts(Caregiver)).toEqual([1, 1]);

    await admin.deleteReview(review.id, Admin, '  욕설 포함  ');

    expect(await receivedCounts(Caregiver)).toEqual([0, 0]);
    expect(await reviews.listReceived(Caregiver)).toHaveLength(0);
    // 작성자 본인에게는 지워진 사실이 보인다
    expect((await reviews.listWritten(Guardian))[0]?.deletedAt).toEqual(expect.any(String));

    const [mine] = await reviews.listReports(Caregiver);
    expect(mine).toMatchObject({ status: 'accepted', resolutionNote: '욕설 포함' });
    expect(await admin.listReports('open')).toHaveLength(0);

    // 지워진 뒤에도 큐에서 사라지지 않고 삭제 시각이 붙는다
    const accepted = await admin.listReports('accepted');
    expect(accepted).toHaveLength(2);
    expect(accepted[0]?.reviewDeletedAt).toEqual(expect.any(String));

    // 지운 뒤 다시 쓰는 것으로 후기 수정을 우회할 수 없다
    await expect(reviews.create(match.id, Guardian, { rating: 5 })).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('지워진 후기는 다시 지우거나 신고할 수 없다', async () => {
    const { review } = await seedGuardianReview();
    await admin.deleteReview(review.id, Admin);

    await expect(admin.deleteReview(review.id, Admin)).rejects.toMatchObject({ code: 'invalid_state' });
    await expect(reviews.report(review.id, Caregiver, { reason: 'abuse' })).rejects.toMatchObject({
      code: 'invalid_state',
    });
  });

  it('되돌리면 평균에 다시 들어가고, 마감했던 신고는 반려로 바뀐다', async () => {
    const { review } = await seedGuardianReview();
    const report = await reviews.report(review.id, Caregiver, { reason: 'falseInfo' });
    await admin.deleteReview(review.id, Admin);

    await admin.restoreReview(review.id, Admin, '허위 아님');

    expect(await receivedCounts(Caregiver)).toEqual([1, 1]);
    expect((await reviews.listWritten(Guardian))[0]).not.toHaveProperty('deletedAt');
    expect((await reviews.listReports(Caregiver))[0]?.status).toBe('dismissed');

    await expect(admin.restoreReview(review.id, Admin)).rejects.toMatchObject({ code: 'invalid_state' });
    await expect(admin.dismissReport(report.id, Admin)).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('반려해도 후기는 남고, 신고한 사람에게는 반려로 보인다', async () => {
    const { review } = await seedGuardianReview();
    const report = await reviews.report(review.id, Caregiver, { reason: 'falseInfo' });

    await admin.dismissReport(report.id, Admin, '평가일 뿐');

    expect(await reviews.listReceived(Caregiver)).toHaveLength(1);
    expect((await reviews.listReports(Caregiver))[0]).toMatchObject({ status: 'dismissed', resolutionNote: '평가일 뿐' });
  });
});

describe('관리자 매칭 조치 (Phase 11)', () => {
  it('노쇼를 되돌리면 수락이 아니라 관리자 취소로 남고, 그 간병인이 다시 수락할 수 있다', async () => {
    const request = await seedRequest({ startDate: daysFromToday(-2) });
    const match = await acceptRequest(request.id);
    await history.reportNoShow(match.id, Guardian, '안 오심');

    expect((await admin.listDisputedMatches()).find((item) => item.matchId === match.id)?.kind).toBe('noShow');

    await admin.clearNoShow(match.id, Admin, '착오 신고');

    const cleared = await findMatch(request.id, Caregiver, Caregiver);
    // 간병인 화면에 "보호자가 취소"로 잘못 읽히지 않는다
    expect(cleared).toMatchObject({ status: 'cancelled', cancelledBy: 'admin' });
    expect(cleared).not.toHaveProperty('noShowAt');
    expect((await admin.listDisputedMatches()).some((item) => item.matchId === match.id)).toBe(false);
    await expect(admin.clearNoShow(match.id, Admin)).rejects.toMatchObject({ code: 'invalid_state' });

    await requests.accept(request.id, Caregiver);
    const again = (await history.listForGuardian(Guardian)).filter((item) => item.requestId === request.id);
    expect(again.map((item) => item.status).sort()).toEqual(['accepted', 'cancelled']);
  });

  it('종료일이 지났는데 살아 있는 매칭을 끊으면, 시작 전이었으므로 요청이 다시 열린다', async () => {
    const request = await seedRequest({ startDate: daysFromToday(-5), endDate: daysFromToday(-1) });
    const match = await acceptRequest(request.id, NewCaregiver);

    expect((await admin.listDisputedMatches()).find((item) => item.matchId === match.id)?.kind).toBe('overdue');

    await admin.cancelMatch(match.id, Admin, '종료 확인');

    expect(await findMatch(request.id, NewCaregiver)).toMatchObject({ status: 'cancelled', cancelledBy: 'admin' });
    expect((await requests.list(Guardian))[0]?.status).toBe('pending');
    await expect(admin.cancelMatch(match.id, Admin)).rejects.toMatchObject({ code: 'invalid_state' });
  });

  it('끝날 날을 적지 않은 간병은 방치로 보지 않는다', async () => {
    const request = await seedRequest({ startDate: daysFromToday(-30) });
    await acceptRequest(request.id, HomeCaregiver);

    expect(await admin.listDisputedMatches()).toHaveLength(0);
  });
});

describe('조치 기록 (Phase 11)', () => {
  it('조치마다 관리자·대상·메모가 최근 순으로 남는다', async () => {
    const { review } = await seedGuardianReview();
    await admin.deleteReview(review.id, Admin, '  욕설 포함  ');
    await admin.restoreReview(review.id, Admin, '허위 아님');

    const actions = await admin.listActions();

    expect(actions.map((item) => item.action)).toEqual(['reviewRestored', 'reviewDeleted']);
    expect(actions[1]).toMatchObject({ adminId: Admin, targetType: 'review', targetId: review.id, note: '욕설 포함' });
    expect(await admin.listActions(1)).toHaveLength(1);
  });
});
