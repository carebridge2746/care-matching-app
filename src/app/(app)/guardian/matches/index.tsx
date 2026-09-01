import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MatchCancelForm, MatchCard } from '@/components/care';
import { AppText, EmptyState, LoadingView, Screen } from '@/components/common';
import { useAuthStore } from '@/store/use-auth-store';
import { liveMatches, pastMatches, useMatchHistoryStore } from '@/store/use-match-history-store';
import { Spacing } from '@/theme';

/**
 * 간병 진행 상황 — 보호자 쪽 화면.
 *
 * 간병인 화면과 같은 카드를 보되 시작 버튼은 없다. 간병을 시작했다고 표시하는 일은
 * 실제로 출근한 사람만 할 수 있어야 하기 때문이다. 종료는 양쪽 모두 누를 수 있다.
 */
export default function GuardianMatchesScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const matches = useMatchHistoryStore((state) => state.matches);
  const isLoading = useMatchHistoryStore((state) => state.isLoading);
  const updatingId = useMatchHistoryStore((state) => state.updatingId);
  const errorMessage = useMatchHistoryStore((state) => state.errorMessage);
  const load = useMatchHistoryStore((state) => state.load);
  const complete = useMatchHistoryStore((state) => state.complete);
  const cancel = useMatchHistoryStore((state) => state.cancel);

  /** 취소 확인을 펼쳐 둔 매칭. 한 번에 하나만 연다. */
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const guardianId = user?.id;

  // 간병인이 간병을 시작하거나 끝냈을 수 있으므로 화면에 돌아올 때마다 다시 불러온다
  useFocusEffect(
    useCallback(() => {
      if (guardianId) {
        void load(guardianId, 'guardian');
      }
    }, [guardianId, load])
  );

  if (isLoading && matches.length === 0) {
    return <LoadingView message="간병 진행 상황을 불러오는 중입니다" />;
  }

  const live = liveMatches(matches);
  const past = pastMatches(matches);

  return (
    <Screen scroll edges={['bottom']}>
      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}

      {matches.length === 0 ? (
        <EmptyState
          title="아직 매칭된 간병이 없습니다"
          description="간병 요청을 올리면 조건이 맞는 간병인이 수락할 수 있습니다. 수락되면 여기에서 진행 상황을 확인하실 수 있습니다."
          actionTitle="간병 요청 보기"
          onAction={() => router.replace('/guardian/requests')}
        />
      ) : null}

      {live.length > 0 ? (
        <View style={styles.section}>
          <AppText variant="heading">진행 중인 간병</AppText>
          <AppText variant="caption" tone="secondary">
            간병인이 출근하면 진행중으로 바뀝니다. 간병이 끝나면 종료를 눌러 주세요.
          </AppText>

          {live.map((match) =>
            cancellingId === match.id ? (
              <MatchCancelForm
                key={match.id}
                match={match}
                viewer="guardian"
                busy={updatingId === match.id}
                onDismiss={() => setCancellingId(null)}
                onConfirm={(reason) => {
                  if (!guardianId) {
                    return;
                  }
                  void cancel(match.id, guardianId, reason).then(() => setCancellingId(null));
                }}
              />
            ) : (
              <MatchCard
                key={match.id}
                match={match}
                viewer="guardian"
                busy={updatingId === match.id}
                onPress={() => router.push(`/guardian/requests/${match.requestId}`)}
                onComplete={() => {
                  if (guardianId) {
                    void complete(match.id, guardianId);
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
            끝났거나 취소된 간병입니다. 취소된 간병은 간병인의 연락처를 다시 가립니다.
          </AppText>
          {past.map((match) => (
            <MatchCard key={match.id} match={match} viewer="guardian" />
          ))}
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
