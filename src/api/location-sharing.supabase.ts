import { ApiError } from '@/api/api-error';
import type { LocationSharingAdapter } from '@/api/location-sharing.types';

/**
 * Supabase 안심 도착 어댑터 — 자리만 잡아 두었다 (Phase 13).
 *
 * 이번 단계는 Mock 으로만 동작한다. Supabase 모드에서 이 화면을 열면 "아직 지원하지 않음"으로 안내한다.
 *
 * TODO(Supabase): 붙일 때 정할 것
 *   - location_sharings 표: match_id 기본키, status(snake_case), consent_at, started_at,
 *     estimated_arrival_at, last_updated_at, arrived_at, stopped_at, ended_reason, mock_progress.
 *     좌표 컬럼은 두지 않는다.
 *   - 상태를 바꾸는 창구는 함수로만 연다(당사자 간병인만, accepted 매칭만). 테이블 update 정책은 두지 않는다.
 *   - 읽기 창구는 뷰로: 보호자·간병인은 자기 매칭만, 관리자는 공유 시간대의 매칭만.
 *   - 간병 시작·종료·취소 시 자동 종료와 '확인 불가' 판정은 Mock 과 같이 읽을 때 계산한다
 *     (src/lib/arrival.ts 의 규칙을 뷰로 옮긴다).
 */
function notConfigured(): never {
  throw new ApiError('not_configured', '안심 도착은 아직 Mock 모드에서만 동작합니다.');
}

export const supabaseLocationSharingAdapter: LocationSharingAdapter = {
  listForMatches: async () => notConfigured(),
  giveConsent: async () => notConfigured(),
  start: async () => notConfigured(),
  markNearby: async () => notConfigured(),
  markArrived: async () => notConfigured(),
  pause: async () => notConfigured(),
  resume: async () => notConfigured(),
  stop: async () => notConfigured(),
  listArrivalWatch: async () => notConfigured(),
};
