import type { ArrivalWatchItem, LocationSharing } from '@/types';

/**
 * 안심 도착 어댑터의 계약 (Phase 13).
 *
 * 화면과 저장소는 이 타입에만 의존한다. 이번 단계의 구현은 로컬 Mock 뿐이고,
 * Supabase 구현(location-sharing.supabase.ts)은 자리만 잡아 두었다.
 *
 * 실제 위치(GPS 좌표)를 주고받지 않는다. 간병인이 "이동 시작 · 인근 · 도착"을 직접 알리고,
 * 보호자는 그 상태와 예상 도착 시각을 본다.
 *
 * 돌려주는 기록은 언제나 지금 시점에서 읽은 값이다(resolveLocationSharing). 간병이 시작·종료·취소되었으면
 * 공유는 'ended' 로, 업데이트가 오래되었으면 'unavailable' 로 내려온다.
 *
 * 상태를 바꾸는 함수는 그 매칭의 간병인만 부를 수 있다. 다른 사람이면 `not_found`,
 * 지금 상태에서 할 수 없는 동작이면 `invalid_state` 로 거절한다.
 * caregiverId 를 인자로 받는 것은 Mock 에 세션이 없기 때문이다 — 다른 어댑터와 같은 방식이다.
 */
export type LocationSharingAdapter = {
  /** 매칭들의 안심 도착 기록. 기록이 없는 매칭은 '이동 전'으로 내려온다. 없는 매칭은 빠진다. */
  listForMatches: (matchIds: string[]) => Promise<LocationSharing[]>;
  /** 위치 공유 안내에 동의한다. 동의하지 않으면 이동을 시작할 수 없다. */
  giveConsent: (matchId: string, caregiverId: string) => Promise<LocationSharing>;
  /**
   * 이동을 시작한다(공유 시작). 동의가 있어야 하고, 간병 시작 몇 시간 전부터만 된다.
   * 스스로 공유를 끝냈던 매칭은 다시 시작할 수 있다.
   */
  start: (matchId: string, caregiverId: string) => Promise<LocationSharing>;
  /** 약속 장소 인근에 왔다고 알린다 */
  markNearby: (matchId: string, caregiverId: string) => Promise<LocationSharing>;
  /** 도착했다고 알린다. 공유 없이 도착한 경우에도 누를 수 있다. */
  markArrived: (matchId: string, caregiverId: string) => Promise<LocationSharing>;
  /** 공유를 잠시 멈춘다. 보호자에게는 멈췄다는 사실이 보인다. */
  pause: (matchId: string, caregiverId: string) => Promise<LocationSharing>;
  /** 멈춘 공유를 다시 켠다 */
  resume: (matchId: string, caregiverId: string) => Promise<LocationSharing>;
  /** 공유를 끝낸다 */
  stop: (matchId: string, caregiverId: string) => Promise<LocationSharing>;
  /**
   * 관리자 화면의 도착 확인 목록.
   * 아직 시작하지 않은 간병 중 공유 시간대에 들어온 것만 담는다 — 먼 날의 일정까지 훑지 않는다.
   * 이 목록은 판단을 돕는 것이지, 여기서 노쇼를 정하지 않는다.
   */
  listArrivalWatch: () => Promise<ArrivalWatchItem[]>;
};
