import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { AdminNoteForm, DisputedMatchCard } from '@/components/admin';
import { AppText, EmptyState, LoadingView, Screen } from '@/components/common';
import { useAdminStore } from '@/store/use-admin-store';
import { useAuthStore } from '@/store/use-auth-store';
import type { DisputedMatch } from '@/types';

/**
 * 확인이 필요한 매칭 — 노쇼로 신고된 건과, 끝날 날이 지났는데 살아 있는 건.
 *
 * 매칭을 통째로 훑는 목록은 두지 않는다. 문제가 제기된 건만 보인다.
 */
export default function AdminMatchesScreen() {
  const adminId = useAuthStore((state) => state.user?.id);

  const matches = useAdminStore((state) => state.disputedMatches);
  const isLoading = useAdminStore((state) => state.isLoadingDisputed);
  const processingId = useAdminStore((state) => state.processingId);
  const errorMessage = useAdminStore((state) => state.errorMessage);
  const load = useAdminStore((state) => state.loadDisputedMatches);
  const clearNoShow = useAdminStore((state) => state.clearNoShow);
  const cancelMatch = useAdminStore((state) => state.cancelMatch);

  /** 확인 폼을 펼쳐 둔 매칭. 한 번에 하나만 연다. */
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (isLoading && matches.length === 0) {
    return <LoadingView message="확인이 필요한 매칭을 찾는 중입니다" />;
  }

  const handleConfirm = (match: DisputedMatch, note: string) => {
    if (!adminId) {
      return;
    }

    const run =
      match.kind === 'noShow'
        ? clearNoShow(match.matchId, adminId, note)
        : cancelMatch(match.matchId, adminId, note);

    // 성공하면 목록에서 빠지고, 실패하면 다시 불러온 목록이 이미 바뀌어 있다.
    // 어느 쪽이든 펼쳐 둔 폼은 더 이상 맞지 않는다.
    void run.then(() => setOpenMatchId(null));
  };

  return (
    <Screen scroll avoidKeyboard edges={['bottom']}>
      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}

      {matches.length === 0 ? (
        <EmptyState
          title="확인이 필요한 매칭이 없습니다"
          description="보호자가 노쇼를 신고하거나, 끝날 날이 지났는데 아무도 종료하지 않은 간병이 생기면 여기에 나타납니다."
        />
      ) : null}

      {matches.map((match) =>
        openMatchId === match.matchId ? (
          <MatchActionForm
            key={match.matchId}
            match={match}
            busy={processingId === match.matchId}
            onDismiss={() => setOpenMatchId(null)}
            onConfirm={(note) => handleConfirm(match, note)}
          />
        ) : (
          <DisputedMatchCard
            key={match.matchId}
            match={match}
            busy={processingId === match.matchId}
            onClearNoShow={() => setOpenMatchId(match.matchId)}
            onCancel={() => setOpenMatchId(match.matchId)}
          />
        )
      )}
    </Screen>
  );
}

type MatchActionFormProps = {
  match: DisputedMatch;
  busy: boolean;
  onConfirm: (note: string) => void;
  onDismiss: () => void;
};

function MatchActionForm({ match, busy, onConfirm, onDismiss }: MatchActionFormProps) {
  if (match.kind === 'noShow') {
    return (
      <AdminNoteForm
        title={`${match.caregiverName} 간병인의 노쇼 신고를 취소할까요?`}
        consequences={[
          '매칭에서 노쇼 표시가 지워지고, 관리자가 취소한 간병으로 남습니다',
          '수락 상태로 되돌리지는 않습니다 — 그 사이 다른 간병인이 요청을 맡았을 수 있습니다',
          '이 간병인은 같은 요청을 다시 수락할 수 있고 추천에도 다시 나옵니다',
          '노쇼였다는 기록은 조치 기록에만 남습니다',
        ]}
        noteLabel="취소 사유"
        notePlaceholder="예: 간병인이 출근 기록을 제출함, 보호자가 착오로 신고"
        confirmTitle="노쇼 신고 취소"
        busy={busy}
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      />
    );
  }

  return (
    <AdminNoteForm
      title="이 매칭을 강제로 종료할까요?"
      consequences={[
        '매칭이 관리자가 취소한 간병으로 끝납니다',
        match.startedAt
          ? '이미 시작한 간병이라 요청도 함께 닫힙니다'
          : '아직 시작하지 않은 간병이라 요청이 다시 대기중이 됩니다',
        '양쪽 모두에게 "관리자가 취소"로 보입니다',
        '되돌릴 수 없습니다',
      ]}
      noteLabel="종료 사유"
      notePlaceholder="예: 양측 확인 결과 간병이 이미 끝났음"
      confirmTitle="매칭 강제 종료"
      confirmVariant="danger"
      busy={busy}
      onConfirm={onConfirm}
      onDismiss={onDismiss}
    />
  );
}
