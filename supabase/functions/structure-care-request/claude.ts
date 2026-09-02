import Anthropic from 'npm:@anthropic-ai/sdk@^0.123.0';

import { buildSystemPrompt } from './prompt.ts';
import { AiConditionsSchema, sanitize, type AiConditions } from './schema.ts';

/**
 * Claude 호출.
 *
 * `output_config.format` 으로 응답 형태를 스키마에 묶어 둔다. 프롬프트로 "JSON 으로 답해"라고
 * 부탁하는 것과 달리, 이 방식은 응답이 스키마를 벗어날 수 없으므로 파싱 실패를 다루지 않아도 된다.
 *
 * API Key 는 Edge Function 의 secret 으로만 둔다 (`supabase secrets set ANTHROPIC_API_KEY=...`).
 * 앱 번들에 들어가는 EXPO_PUBLIC_ 환경 변수에는 절대 넣지 않는다.
 */

const Model = 'claude-opus-5';

/**
 * 구조화는 짧은 추출 작업이라 낮은 effort 로 충분하고, 보호자가 등록 버튼을 누른 뒤
 * 기다리는 시간이므로 빠른 쪽이 낫다. 원문이 길고 복잡한 편이면 'medium' 으로 올린다.
 */
const Effort = 'low';

/**
 * 출력은 JSON 몇백 토큰이지만 사고(thinking) 토큰도 이 한도에 함께 잡힌다.
 * 너무 좁게 잡으면 답이 중간에서 잘린다.
 */
const MaxTokens = 8000;

/** 원문 길이 상한. 이보다 긴 입력은 호출 전에 거른다. */
export const MaxRawTextLength = 2000;

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

export class StructuringError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'StructuringError';
    this.status = status;
    this.code = code;
  }
}

export async function structureCareRequest(
  rawText: string,
  today: string
): Promise<AiConditions> {
  let response;

  try {
    response = await client.beta.messages.create({
      model: Model,
      max_tokens: MaxTokens,
      system: buildSystemPrompt(today),
      output_config: {
        effort: Effort,
        format: { type: 'json_schema', schema: AiConditionsSchema },
      },
      // 안전 분류기가 요청을 거절하면 같은 호출 안에서 다른 모델이 이어받는다.
      // 이 기능이 필요 없으면 betas·fallbacks 두 줄을 지우고 client.messages.create 로 바꾸면 된다.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      messages: [{ role: 'user', content: rawText }],
    });
  } catch (error) {
    throw toStructuringError(error);
  }

  // 거절은 예외가 아니라 정상 응답으로 돌아온다. content 를 읽기 전에 먼저 본다.
  if (response.stop_reason === 'refusal') {
    console.error('structure-care-request refused', response.stop_details);
    throw new StructuringError(
      422,
      'refused',
      '요청 내용을 정리하지 못했습니다. 간병에 필요한 내용만 적어 주세요.'
    );
  }
  if (response.stop_reason === 'max_tokens') {
    console.error('structure-care-request truncated');
    throw new StructuringError(
      502,
      'incomplete',
      '요청 내용을 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    );
  }

  const text = response.content.find((block) => block.type === 'text');

  if (!text || text.type !== 'text') {
    throw new StructuringError(
      502,
      'empty_response',
      '요청 내용을 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    );
  }

  // 형태는 스키마가 보장하므로 파싱만 하고, 값의 타당성은 sanitize 가 본다
  return sanitize(JSON.parse(text.text) as AiConditions);
}

/**
 * SDK 오류를 앱이 다룰 수 있는 형태로 바꾼다.
 *
 * 오류 문구를 문자열로 비교하지 않고 타입과 상태 코드로만 판단한다 —
 * 문구는 SDK 버전에 따라 바뀔 수 있다. 앱에는 원인을 그대로 내보내지 않는다.
 */
function toStructuringError(error: unknown): StructuringError {
  if (error instanceof Anthropic.RateLimitError) {
    console.error('anthropic rate limited');
    return new StructuringError(
      429,
      'rate_limited',
      '지금은 요청이 몰려 있습니다. 잠시 후 다시 시도해 주세요.'
    );
  }
  if (error instanceof Anthropic.AuthenticationError) {
    // 키가 없거나 틀린 것은 운영 설정 문제다. 사용자에게는 일반 문구만 보여 준다.
    console.error('anthropic authentication failed — check ANTHROPIC_API_KEY secret');
    return new StructuringError(
      502,
      'not_configured',
      '요청 내용을 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    );
  }
  if (error instanceof Anthropic.APIError) {
    console.error('anthropic api error', error.status, error.message);
    return new StructuringError(
      502,
      'upstream_error',
      '요청 내용을 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    );
  }

  console.error('structure-care-request failed', error);
  return new StructuringError(
    500,
    'unknown',
    '요청 내용을 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  );
}
