import { create } from 'zustand';

import { toApiErrorMessage } from '@/api/api-error';
import { matchHistoryApi } from '@/api/match-history';
import { isMatchLive, type CareMatch, type MatchParty } from '@/types';

type MatchHistoryState = {
  /** 최근에 수락한 순서. 취소된 이력도 함께 들어 있다. */
  matches: CareMatch[];
  isLoading: boolean;
  /** 상태를 바꾸는 중인 매칭 id. 누른 카드의 버튼만 로딩으로 바꾼다. */
  updatingId: string | null;
  errorMessage: string | null;
  /** 지금 목록이 누구의 것인지. 다른 사용자가 로그인하면 목록을 먼저 비운다. */
  loadedUserId: string | null;
  /** 어느 쪽에서 보고 있는지. 상태 변경이 실패해 목록을 다시 부를 때 필요하다. */
  loadedParty: MatchParty | null;
  load: (userId: string, party: MatchParty) => Promise<void>;
  start: (matchId: string, caregiverId: string) => Promise<boolean>;
  complete: (matchId: string, actorId: string) => Promise<boolean>;
  cancel: (matchId: string, actorId: string, reason?: string) => Promise<boolean>;
  reportNoShow: (matchId: string, guardianId: string, note?: string) => Promise<boolean>;
  clearError: () => void;
};

/**
 * 매칭 이력과 간병 진행 상태.
 *
 * 보호자와 간병인이 같은 저장소를 쓴다. 요청 목록과 달리 두 사람이 보는 것이 같은 대상 —
 * 같은 간병 한 건 — 이고, 어느 쪽에서 보는지는 `party` 하나로 갈리기 때문이다.
 * 무엇을 보여 줄지(연락처, 환자 특이사항)는 화면이 아니라 어댑터가 정해서 내려준다.
 */
export const useMatchHistoryStore = create<MatchHistoryState>((set, get) => ({
  matches: [],
  isLoading: false,
  updatingId: null,
  errorMessage: null,
  loadedUserId: null,
  loadedParty: null,

  load: async (userId, party) => {
    // 다른 사용자의 목록이 잠깐이라도 보이지 않도록 먼저 비운다
    const isSameUser = get().loadedUserId === userId && get().loadedParty === party;
    set({
      isLoading: true,
      errorMessage: null,
      ...(isSameUser ? {} : { matches: [], loadedUserId: userId, loadedParty: party }),
    });

    try {
      const matches =
        party === 'guardian'
          ? await matchHistoryApi.listForGuardian(userId)
          : await matchHistoryApi.listForCaregiver(userId);

      set({ matches, loadedUserId: userId, loadedParty: party, isLoading: false });
    } catch (error) {
      set({ errorMessage: toApiErrorMessage(error), isLoading: false });
    }
  },

  start: async (matchId, caregiverId) => apply(set, get, matchId, () =>
    matchHistoryApi.start(matchId, caregiverId)
  ),

  complete: async (matchId, actorId) => apply(set, get, matchId, () =>
    matchHistoryApi.complete(matchId, actorId)
  ),

  cancel: async (matchId, actorId, reason) => apply(set, get, matchId, () =>
    matchHistoryApi.cancel(matchId, actorId, reason)
  ),

  reportNoShow: async (matchId, guardianId, note) => apply(set, get, matchId, () =>
    matchHistoryApi.reportNoShow(matchId, guardianId, note)
  ),

  clearError: () => set({ errorMessage: null }),
}));

/**
 * 상태를 옮기는 네 동작이 똑같이 하는 일.
 *
 * 성공하면 돌아온 매칭으로 목록의 그 줄만 갈아 끼우고, 실패하면 목록을 통째로 다시 부른다.
 * 실패는 대개 "상대가 먼저 바꿔 놓았다"는 뜻이라 화면에 남아 있는 목록도 이미 낡았기 때문이다.
 * 다시 부르는 load 가 오류 문구를 비우므로, 안내는 그 뒤에 넣는다.
 */
async function apply(
  set: (partial: Partial<MatchHistoryState>) => void,
  get: () => MatchHistoryState,
  matchId: string,
  run: () => Promise<CareMatch>
): Promise<boolean> {
  set({ updatingId: matchId, errorMessage: null });

  try {
    const updated = await run();
    set({
      matches: get().matches.map((match) => (match.id === matchId ? updated : match)),
      updatingId: null,
    });
    return true;
  } catch (error) {
    const message = toApiErrorMessage(error);
    set({ updatingId: null });

    const { loadedUserId, loadedParty } = get();
    if (loadedUserId && loadedParty) {
      await get().load(loadedUserId, loadedParty);
    }

    set({ errorMessage: message });
    return false;
  }
}

/** 아직 끝나지 않은 간병. 화면 위쪽에 두고 버튼을 붙인다. */
export function liveMatches(matches: CareMatch[]): CareMatch[] {
  return matches.filter((match) => isMatchLive(match.status));
}

/** 끝났거나 취소된 간병. 이력으로만 보여 준다. */
export function pastMatches(matches: CareMatch[]): CareMatch[] {
  return matches.filter((match) => !isMatchLive(match.status));
}

/**
 * 이 요청에 지금 붙어 있는 매칭.
 *
 * 요청 하나에 매칭은 여러 번 붙을 수 있지만(수락 → 취소 → 다른 간병인이 수락),
 * 살아 있는 매칭은 언제나 최대 하나다. 그 규칙은 데이터베이스가 지킨다.
 */
export function liveMatchForRequest(
  matches: CareMatch[],
  requestId: string
): CareMatch | undefined {
  return matches.find((match) => match.requestId === requestId && isMatchLive(match.status));
}
