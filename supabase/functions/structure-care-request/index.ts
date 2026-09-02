import { json, jsonError, preflight } from '../_shared/http.ts';
import { MaxRawTextLength, StructuringError, structureCareRequest } from './claude.ts';

/**
 * 보호자가 적은 간병 요청 원문을 매칭에 쓸 수 있는 조건으로 정리한다.
 *
 *   POST /functions/v1/structure-care-request
 *   { "raw_text": "어머니가 병원에 입원하셔서…", "today": "2026-09-02" }
 *   → { "conditions": { … }, "analyzed_at": "2026-09-02T…Z", "model": "claude-opus-5" }
 *
 * 로그인한 사용자만 부를 수 있다. Supabase 는 배포된 함수에 대해 기본적으로 JWT 를 검증하므로
 * (`verify_jwt` 기본값 true) 여기서 토큰을 다시 파싱하지 않는다. 다만 헤더가 아예 없으면
 * 설정이 꺼져 있다는 뜻이므로 직접 막는다 — LLM 호출은 돈이 나가는 경로다.
 *
 * 이 함수는 데이터베이스에 쓰지 않는다. 돌려준 값을 요청 행에 함께 저장하는 일은 앱이 한다
 * (src/store/use-care-requests-store.ts). 요청을 만드는 흐름과 정리하는 흐름을 하나로 묶어 두면,
 * AI 호출이 실패했다는 이유로 요청 등록까지 막히게 된다.
 */

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return preflight();
  }
  if (request.method !== 'POST') {
    return jsonError(405, 'method_not_allowed', '허용되지 않은 요청 방식입니다.');
  }
  if (!request.headers.get('Authorization')) {
    return jsonError(401, 'unauthorized', '로그인이 필요합니다.');
  }

  let body: { raw_text?: unknown; today?: unknown };

  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'invalid_body', '요청 형식이 올바르지 않습니다.');
  }

  const rawText = typeof body.raw_text === 'string' ? body.raw_text.trim() : '';

  if (rawText.length < 10) {
    return jsonError(400, 'invalid_input', '간병 요청 내용을 10자 이상 적어 주세요.');
  }
  if (rawText.length > MaxRawTextLength) {
    return jsonError(
      400,
      'invalid_input',
      `간병 요청 내용은 ${MaxRawTextLength}자까지 정리할 수 있습니다.`
    );
  }

  // 상대 날짜("다음 주 월요일")를 풀려면 사용자의 오늘이 필요하다.
  // 서버는 UTC 로 도는데 사용자는 한국 시간이라, 자정 무렵에는 하루가 어긋난다.
  const today = isIsoDate(body.today) ? body.today : koreaToday();

  try {
    const conditions = await structureCareRequest(rawText, today);

    return json({
      conditions,
      analyzed_at: new Date().toISOString(),
      model: 'claude-opus-5',
    });
  } catch (error) {
    if (error instanceof StructuringError) {
      return jsonError(error.status, error.code, error.message);
    }

    console.error('structure-care-request unhandled', error);
    return jsonError(500, 'unknown', '요청 내용을 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
});

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** 앱이 오늘 날짜를 보내지 않았을 때 쓰는 기준. 한국 시간(UTC+9)으로 계산한다. */
function koreaToday(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
