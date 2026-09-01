import type { CareMatch } from '@/types';

/**
 * 매칭 이력 어댑터의 계약.
 *
 * 화면과 저장소는 이 타입에만 의존한다.
 * 구현은 로컬 Mock(match-history.mock.ts)과 Supabase(match-history.supabase.ts) 두 가지다.
 *
 * 매칭을 "만드는" 메서드는 없다. 매칭은 간병인이 요청을 수락할 때만 생기고,
 * 그 일은 이미 careRequestsApi.accept() 가 맡고 있다. 수락과 매칭 생성을 두 번에 나눠 부르면
 * 앞만 성공한 요청 — 수락됐는데 매칭 기록이 없는 요청 — 이 남을 수 있다.
 * Supabase 쪽에서는 두 일이 한 함수(accept_care_request) 안에서 함께 일어난다.
 *
 * 상태를 옮기는 세 메서드는 지금 상태에서 할 수 없는 동작이면 `invalid_state` 로 거절한다.
 * 이 판정은 화면이 아니라 저장소에서 이뤄진다 — 목록을 띄워 둔 사이에 상대가 먼저
 * 상태를 바꿔 놓았을 수 있기 때문이다.
 *
 * actor(누가 눌렀는가)를 인자로 받는 이유는 Mock 구현 때문이다.
 * Supabase 모드에서는 데이터베이스가 로그인한 사용자를 직접 보므로 이 값을 쓰지 않는다.
 */
export type MatchHistoryAdapter = {
  /** 이 보호자의 매칭 전부. 취소된 이력까지 포함해 최근 수락 순으로 돌려준다. */
  listForGuardian: (guardianId: string) => Promise<CareMatch[]>;
  /** 이 간병인의 매칭 전부. 취소된 이력까지 포함해 최근 수락 순으로 돌려준다. */
  listForCaregiver: (caregiverId: string) => Promise<CareMatch[]>;

  /**
   * 간병을 시작한다 (accepted → inProgress).
   * 출근한 사람이 누르는 버튼이므로 당사자 간병인만 할 수 있다.
   */
  start: (matchId: string, caregiverId: string) => Promise<CareMatch>;
  /**
   * 간병을 끝낸다 (inProgress → completed).
   *
   * 보호자와 간병인 어느 쪽이든 누를 수 있다. 한쪽만 누를 수 있게 하면
   * 상대가 앱을 열지 않는 동안 간병이 계속 진행중으로 남는다.
   */
  complete: (matchId: string, actorId: string) => Promise<CareMatch>;
  /**
   * 매칭을 취소한다 (accepted·inProgress → cancelled).
   *
   * 시작 전에 취소하면 요청은 다시 대기중으로 돌아가 다른 간병인이 수락할 수 있고,
   * 시작한 뒤에 취소하면 요청도 함께 닫힌다.
   */
  cancel: (matchId: string, actorId: string, reason?: string) => Promise<CareMatch>;
};
