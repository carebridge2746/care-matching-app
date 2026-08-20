import { AuthError } from '@/api/auth.types';

/**
 * 데이터 조회·저장 중에 생기는 오류.
 *
 * 인증 오류(AuthError)와 마찬가지로 message는 화면에 그대로 노출되므로
 * 사용자가 읽을 수 있는 문장으로 작성한다.
 */

export type ApiErrorCode =
  /** 요청한 자료가 없거나 이미 지워졌다 */
  | 'not_found'
  /** 로그인은 되어 있지만 이 자료를 다룰 권한이 없다 (RLS 거부) */
  | 'permission_denied'
  /** 서버가 거부한 입력값 */
  | 'invalid_input'
  /** 지금 상태에서는 할 수 없는 동작 (예: 이미 매칭된 요청 삭제) */
  | 'invalid_state'
  /** 서버에 연결하지 못했다 */
  | 'network_error'
  /** 환경 변수 등 설정이 끝나지 않았다 */
  | 'not_configured'
  | 'unknown';

export class ApiError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
  }
}

/**
 * 어떤 오류가 오든 화면에 보여줄 문장을 만든다.
 * 데이터 요청은 세션 만료로도 실패할 수 있어서 인증 오류까지 함께 받는다.
 */
export function toApiErrorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof AuthError) {
    return error.message;
  }
  return '문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}
