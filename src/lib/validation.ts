import { isValidIsoDate, isValidTime } from '@/lib/date';

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

// --- Phase 3: 환자 정보 / 간병 요청 ------------------------------------------

/** 비어 있으면 안 되는 일반 입력 */
export function validateRequired(value: string, label: string): string | null {
  return value.trim() ? null : `${label}을(를) 입력해 주세요.`;
}

/** 출생연도 — 숫자 4자리, 사람이 살아 있을 수 있는 범위 */
export function validateBirthYear(value: string, now: Date = new Date()): string | null {
  const text = value.trim();
  if (!text) {
    return '출생연도를 입력해 주세요.';
  }

  const year = Number(text);
  if (!Number.isInteger(year)) {
    return '출생연도는 숫자 네 자리로 입력해 주세요. 예) 1948';
  }

  const currentYear = now.getFullYear();
  if (year < currentYear - 120 || year > currentYear) {
    return `출생연도는 ${currentYear - 120}년부터 ${currentYear}년 사이로 입력해 주세요.`;
  }

  return null;
}

/** 일당 예산 — 선택 입력, 0 이상의 정수 */
export function validateBudget(value: string): string | null {
  const text = value.trim();
  if (!text) {
    return null;
  }

  const amount = Number(text.replace(/,/g, ''));
  if (!Number.isInteger(amount) || amount < 0) {
    return '예산은 숫자로만 입력해 주세요. 예) 120000';
  }

  return null;
}

/** 간병 요청 원문 — AI가 조건을 뽑을 수 있을 만큼은 적어야 한다 */
export const MinRequestTextLength = 10;

export function validateRequestText(value: string): string | null {
  const text = value.trim();
  if (!text) {
    return '어떤 간병이 필요한지 적어 주세요.';
  }
  if (text.length < MinRequestTextLength) {
    return `${MinRequestTextLength}자 이상 적어 주세요. 상황을 자세히 적을수록 잘 맞는 간병인을 찾습니다.`;
  }

  return null;
}

/** 날짜 — YYYY-MM-DD 형식이면서 실제로 있는 날짜여야 한다 */
export function validateDate(value: string, label: string): string | null {
  const text = value.trim();
  if (!text) {
    return `${label}을(를) 입력해 주세요.`;
  }
  if (!isValidIsoDate(text)) {
    return `${label}은(는) 2026-09-01 처럼 적어 주세요.`;
  }
  return null;
}

/** 종료일은 선택 입력이며, 넣었다면 시작일보다 빠를 수 없다 */
export function validateEndDate(startDate: string, endDate: string): string | null {
  const text = endDate.trim();
  if (!text) {
    return null;
  }
  if (!isValidIsoDate(text)) {
    return '종료일은 2026-09-01 처럼 적어 주세요.';
  }
  if (isValidIsoDate(startDate) && text < startDate) {
    return '종료일은 시작일보다 빠를 수 없습니다.';
  }
  return null;
}

/** 시각 — 선택 입력, HH:MM */
export function validateTime(value: string, label: string): string | null {
  const text = value.trim();
  if (!text) {
    return null;
  }
  if (!isValidTime(text)) {
    return `${label}은(는) 09:00 처럼 적어 주세요.`;
  }
  return null;
}
