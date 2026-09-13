import type { PostgrestError } from '@supabase/supabase-js';

import { ApiError } from '@/api/api-error';

/**
 * Postgres/PostgREST 오류를 화면에 보여줄 수 있는 문장으로 바꾼다.
 *
 * 오류 문구를 문자열로 비교하지 않고 코드로만 판단한다.
 * 문구는 Supabase 버전에 따라 바뀔 수 있다.
 */
export function toApiError(error: PostgrestError, fallbackMessage: string): ApiError {
  switch (error.code) {
    // single()/maybeSingle() 이 기대한 행을 찾지 못한 경우
    case 'PGRST116':
      return new ApiError('not_found', '자료를 찾지 못했습니다. 목록을 새로 불러와 주세요.');
    // RLS 가 막은 경우. 로그인이 풀렸거나 남의 자료를 건드린 것이다.
    case '42501':
      return new ApiError(
        'permission_denied',
        '이 자료를 다룰 권한이 없습니다. 다시 로그인한 뒤 시도해 주세요.'
      );
    // 외래키 위반 — 가리키는 환자가 없거나 다른 보호자의 환자다
    case '23503':
      return new ApiError('invalid_input', '연결된 환자 정보를 찾지 못했습니다. 환자를 다시 선택해 주세요.');
    // check 제약 위반 — 서버 쪽 입력 조건에 맞지 않는다
    case '23514':
      return new ApiError('invalid_input', '입력한 내용이 저장 조건에 맞지 않습니다. 다시 확인해 주세요.');
    case '23505':
      return new ApiError('invalid_input', '이미 등록된 자료입니다.');
    // 함수가 "지금 상태에서는 할 수 없다"고 거절한 경우. 문구는 함수가 화면에 보일 문장으로 쓴다.
    case '22023':
      return new ApiError('invalid_state', error.message || fallbackMessage);
    default:
      break;
  }

  // 요청이 서버에 닿지 못하면 코드 없이 돌아온다
  if (!error.code) {
    return new ApiError(
      'network_error',
      '서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.'
    );
  }

  return new ApiError('unknown', fallbackMessage);
}
