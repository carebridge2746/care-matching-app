/**
 * Edge Function 이 공통으로 쓰는 HTTP 처리.
 *
 * 앱은 웹(Expo Web)에서도 이 함수를 부르므로 CORS 를 열어 두어야 한다.
 * 다만 응답 본문에는 내부 오류 문구를 그대로 담지 않는다 — 화면에 보일 문장만 내보내고,
 * 원인은 서버 로그에만 남긴다.
 */

export const CorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

export function preflight(): Response {
  return new Response('ok', { headers: CorsHeaders });
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CorsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * 오류 응답.
 *
 * `code` 는 앱이 분기에 쓰고, `message` 는 사용자에게 그대로 보여 줄 수 있는 문장이다.
 * 원인을 자세히 알려 주지 않는다 — 어떤 요청이 어떤 이유로 막혔는지는 로그에서만 본다.
 */
export function jsonError(status: number, code: string, message: string): Response {
  return json({ error: { code, message } }, status);
}
