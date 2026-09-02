import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MatchCancelForm, MatchCard, ReviewForm } from '@/components/care';
import { AppText, EmptyState, LoadingView, Screen } from '@/components/common';
import { useAuthStore } from '@/store/use-auth-store';
import {
  liveMatches,
  pastMatches,
  useMatchHistoryStore,
} from '@/store/use-match-history-store';
import { hasReviewed, useReviewsStore } from '@/store/use-reviews-store';
import { Spacing } from '@/theme';

/**
 * 수락한 간병과 진행 상황.
 *
 * 매칭이 확정된 간병이므로 환자 성함과 보호자 연락처가 가려지지 않은 채로 보인다.
 * 위쪽은 지금 해야 할 일(시작·종료·취소)이 있는 간병이고, 아래쪽은 끝난 이력이다.
 * 끝난 간병을 지우지 않는 이유는 후기(Phase 8)가 이 기록을 입구로 삼기 때문이다.
 */
export default function AcceptedCareScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const matches = useMatchHistoryStore((state) => state.matches);
  const isLoading = useMatchHistoryStore((state) => state.isLoading);
  const updatingId = useMatchHistoryStore((state) => state.updatingId);
  const errorMessage = useMatchHistoryStore((state) => state.errorMessage);
  const load = useMatchHistoryStore((state) => state.load);
  const start = useMatchHistoryStore((state) => state.start);
  const complete = useMatchHistoryStore((state) => state.complete);
  const cancel = useMatchHistoryStore((state) => state.cancel);

  const written = useReviewsStore((state) => state.written);
  const submittingReviewId = useReviewsStore((state) => state.submittingMatchId);
  const reviewError = useReviewsStore((state) => state.errorMessage);
  const loadReviews = useReviewsStore((state) => state.load);
  const submitReview = useReviewsStore((state) => state.submit);

  /** 취소 확인을 펼쳐 둔 매칭. 한 번에 하나만 연다. */
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  /** 후기 작성을 펼쳐 둔 매칭 */
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const caregiverId = user?.id;

  // 보호자가 요청을 거두거나 간병을 종료했을 수 있으므로 화면에 돌아올 때마다 다시 불러온다
  useFocusEffect(
    useCallback(() => {
      if (caregiverId) {
        void load(caregiverId, 'caregiver');
        void loadReviews(caregiverId);
      }
    }, [caregiverId, load, loadReviews])
  );

  if (isLoading && matches.length === 0) {
    return <LoadingView message="수락한 간병을 불러오는 중입니다" />;
  }

  const live = liveMatches(matches);
  const past = pastMatches(matches);

  return (
    <Screen scroll edges={['bottom']}>
      {errorMessage || reviewError ? (
        <AppText variant="body" tone="danger">
          {errorMessage ?? reviewError}
        </AppText>
      ) : null}

      {matches.length === 0 ? (
        <EmptyState
          title="아직 수락한 간병이 없습니다"
          description="대기 중인 요청을 살펴보고 조건이 맞는 간병을 수락해 보세요."
          actionTitle="간병 요청 찾기"
          onAction={() => router.replace('/caregiver/requests')}
        />
      ) : null}

      {live.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="heading">진행 중인 간병</AppText>
          <AppText variant="caption" tone="secondary">
            출근하시면 간병 시작을 눌러 주세요. 보호자 화면에도 같은 상태가 표시됩니다.
          </AppText>

          {live.map((match) =>
            cancellingId === match.id ? (
              <MatchCancelForm
                key={match.id}
                match={match}
                viewer="caregiver"
                busy={updatingId === match.id}
                onDismiss={() => setCancellingId(null)}
                onConfirm={(reason) => {
                  if (!caregiverId) {
                    return;
                  }
                  void cancel(match.id, caregiverId, reason).then(() => setCancellingId(null));
                }}
              />
            ) : (
              <MatchCard
                key={match.id}
                match={match}
                viewer="caregiver"
                busy={updatingId === match.id}
                onPress={() => router.push(`/caregiver/requests/${match.requestId}`)}
                onStart={() => {
                  if (caregiverId) {
                    void start(match.id, caregiverId);
                  }
                }}
                onComplete={() => {
                  if (caregiverId) {
                    void complete(match.id, caregiverId);
                  }
                }}
                onCancel={() => setCancellingId(match.id)}
              />
            )
          )}
        </View>
      ) : null}

      {past.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="heading">지난 간병</AppText>
          <AppText variant="caption" tone="secondary">
            끝난 간병에는 후기를 남길 수 있습니다. 한 간병에 한 번만 남길 수 있습니다.
          </AppText>

          {past.map((match) =>
            reviewingId === match.id ? (
              <ReviewForm
                key={match.id}
                viewer="caregiver"
                counterpartName={match.guardian.name}
                busy={submittingReviewId === match.id}
                onDismiss={() => setReviewingId(null)}
                onSubmit={(input) => {
                  if (!caregiverId) {
                    return;
                  }
                  void submitReview(match.id, caregiverId, input).then((saved) => {
                    // 실패하면 폼을 닫지 않는다. 적은 내용이 사라지면 다시 쓰지 않는다.
                    if (saved) {
                      setReviewingId(null);
                    }
                  });
                }}
              />
            ) : (
              <MatchCard
                key={match.id}
                match={match}
                viewer="caregiver"
                reviewed={hasReviewed(written, match.id)}
                onReview={() => setReviewingId(match.id)}
              />
            )
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.md,
    paddingTop: Spacing.md,
  },
});
