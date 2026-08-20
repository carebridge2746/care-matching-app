/**
 * 입력 검증 규칙.
 *
 * 화면마다 다른 문구가 나오지 않도록 오류 메시지까지 여기서 정의한다.
 * 통과하면 null, 실패하면 사용자에게 그대로 보여줄 한국어 메시지를 반환한다.
 */

const EmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 숫자와 하이픈만 허용. 10~11자리 휴대폰/일반전화를 모두 받는다 */
const PhonePattern = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;

export const MinPasswordLength = 8;

export function validateEmail(value: string): string | null {
  const email = value.trim();
  if (!email) {
    return '이메일을 입력해 주세요.';
  }
  if (!EmailPattern.test(email)) {
    return '이메일 형식이 올바르지 않습니다. 예) name@example.com';
  }
  return null;
}

export function validatePassword(value: string): string | null {
  if (!value) {
    return '비밀번호를 입력해 주세요.';
  }
  if (value.length < MinPasswordLength) {
    return `비밀번호는 ${MinPasswordLength}자 이상이어야 합니다.`;
  }
  return null;
}

export function validatePasswordConfirm(password: string, confirm: string): string | null {
  if (!confirm) {
    return '비밀번호를 한 번 더 입력해 주세요.';
  }
  if (password !== confirm) {
    return '비밀번호가 서로 다릅니다.';
  }
  return null;
}

export function validateName(value: string): string | null {
  const name = value.trim();
  if (!name) {
    return '이름을 입력해 주세요.';
  }
  if (name.length < 2) {
    return '이름은 2자 이상 입력해 주세요.';
  }
  return null;
}

/** 연락처는 선택 입력이므로 비어 있으면 통과시킨다 */
export function validatePhone(value: string): string | null {
  const phone = value.trim();
  if (!phone) {
    return null;
  }
  if (!PhonePattern.test(phone)) {
    return '연락처 형식이 올바르지 않습니다. 예) 010-1234-5678';
  }
  return null;
}
