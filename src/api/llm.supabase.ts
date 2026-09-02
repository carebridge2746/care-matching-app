import { FunctionsHttpError } from '@supabase/supabase-js';

import { ApiError } from '@/api/api-error';
import type { LlmAdapter } from '@/api/llm.types';
import { getSupabaseClient } from '@/api/supabase-client';
import { Weekdays, type AiCareConditions, type Weekday } from '@/types';

/**
 * Edge Function 을 거치는 AI 어댑터.
 *
 * 앱은 LLM 을 직접 부르지 않는다. API Key 는 EXPO_PUBLIC_ 환경 변수에 둘 수 없고
 * (번들에 그대로 박힌다), 프롬프트와 스키마도 앱을 새로 배포하지 않고 고칠 수 있어야 한다.
 * 그래서 호출은 supabase/functions/structure-care-request 가 대신한다.
 *
 * 함수는 스키마로 형태가 고정된 값을 돌려주지만, 여기서 한 번 더 확인하고 앱 타입으로 옮긴다.
 * 네트워크 너머에서 온 값이고, 함수와 앱이 서로 다른 시점에 배포될 수 있기 때문이다.
 */

const FunctionName = 'structure-care-request';

/** 함수가 돌려주는 payload. 컬럼 표기와 마찬가지로 snake_case 다. */
type ConditionsPayload = {
  conditions?: {
    location?: unknown;
    care_place?: unknown;
    care_type?: unknown;
    required_skills?: unknown;
    schedule?: {
      start_date?: unknown;
      end_date?: unknown;
      daily_start_time?: unknown;
      daily_end_time?: unknown;
      weekdays?: unknown;
      note?: unknown;
    };
    gender_preference?: unknown;
    budget_per_day?: unknown;
    additional_notes?: unknown;
    confidence?: unknown;
  };
};

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asTextList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function asOneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function toConditions(payload: ConditionsPayload['conditions']): AiCareConditions {
  const schedule = payload?.schedule ?? {};

  return {
    ...(asText(payload?.location) ? { location: asText(payload?.location) as string } : {}),
    carePlace: asOneOf(payload?.care_place, ['hospital', 'home', 'facility', 'unknown'] as const, 'unknown'),
    careType: asTextList(payload?.care_type),
    requiredSkills: asTextList(payload?.required_skills),
    schedule: {
      ...(asText(schedule.start_date) ? { startDate: asText(schedule.start_date) as string } : {}),
      ...(asText(schedule.end_date) ? { endDate: asText(schedule.end_date) as string } : {}),
      ...(asText(schedule.daily_start_time)
        ? { dailyStartTime: asText(schedule.daily_start_time) as string }
        : {}),
      ...(asText(schedule.daily_end_time)
        ? { dailyEndTime: asText(schedule.daily_end_time) as string }
        : {}),
      weekdays: asTextList(schedule.weekdays).filter((day): day is Weekday =>
        (Weekdays as readonly string[]).includes(day)
      ),
      ...(asText(schedule.note) ? { note: asText(schedule.note) as string } : {}),
    },
    genderPreference: asOneOf(payload?.gender_preference, ['male', 'female', 'any'] as const, 'any'),
    ...(typeof payload?.budget_per_day === 'number' && payload.budget_per_day > 0
      ? { budgetPerDay: Math.round(payload.budget_per_day) }
      : {}),
    ...(asText(payload?.additional_notes)
      ? { additionalNotes: asText(payload?.additional_notes) as string }
      : {}),
    confidence: asOneOf(payload?.confidence, ['high', 'medium', 'low'] as const, 'low'),
  };
}

/**
 * 함수가 4xx·5xx 를 돌려주면 SDK 는 FunctionsHttpError 를 준다.
 * 본문에 담긴 안내 문장을 꺼내 그대로 보여 준다 — 함수가 사용자용 문장으로 적어 보내기 때문이다.
 */
async function toApiError(error: unknown): Promise<ApiError> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = (await error.context.json()) as { error?: { code?: string; message?: string } };
      const message = body.error?.message;

      if (message) {
        return new ApiError(
          body.error?.code === 'rate_limited' ? 'invalid_state' : 'unknown',
          message
        );
      }
    } catch {
      // 본문을 읽지 못하면 아래 기본 문구로 내려간다
    }
  }

  return new ApiError('unknown', '요청 내용을 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
}

export const supabaseLlmAdapter: LlmAdapter = {
  async structureCareRequest(rawText, today) {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase.functions.invoke<ConditionsPayload>(FunctionName, {
      body: { raw_text: rawText, today },
    });

    if (error) {
      throw await toApiError(error);
    }
    if (!data?.conditions) {
      throw new ApiError('unknown', '요청 내용을 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }

    return toConditions(data.conditions);
  },
};

