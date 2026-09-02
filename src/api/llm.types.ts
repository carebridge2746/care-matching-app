import type { AiCareConditions } from '@/types';

/**
 * AI 어댑터의 계약.
 *
 * 화면과 저장소는 이 타입에만 의존한다.
 * 구현은 로컬 Mock(llm.mock.ts)과 Edge Function 호출(llm.supabase.ts) 두 가지다.
 *
 * 어댑터는 정리만 하고 저장하지 않는다. 저장은 간병 요청을 만드는 쪽(careRequestsApi.create)이
 * 한 번에 처리한다 — 요청 행이 만들어지기 전에 조건만 따로 남겨 둘 자리가 없기 때문이다.
 */
export type LlmAdapter = {
  /**
   * 보호자가 적은 원문을 매칭에 쓸 수 있는 조건으로 정리한다.
   *
   * 실패하면 ApiError 를 던진다. 부르는 쪽은 이 실패로 간병 요청 등록까지 막지 않는다 —
   * 조건 정리는 요청을 더 잘 매칭하기 위한 것이지, 요청을 올리기 위한 준비물이 아니다.
   *
   * @param today 상대 날짜("다음 주 월요일")를 푸는 기준. 기기의 현지 날짜를 넘긴다.
   */
  structureCareRequest: (rawText: string, today: string) => Promise<AiCareConditions>;
};
