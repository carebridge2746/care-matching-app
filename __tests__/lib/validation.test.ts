import {
  validateAtLeastOne,
  validateBirthYear,
  validateBudget,
  validateDate,
  validateEmail,
  validateEndDate,
  validateName,
  validatePassword,
  validatePasswordConfirm,
  validatePhone,
  validateRequestText,
  validateRequired,
  validateTime,
  validateYearsOfExperience,
} from '@/lib/validation';

describe('오류 문구의 조사', () => {
  it('칸 이름에 맞는 조사를 하나만 붙인다 — "을(를)"처럼 둘 다 적지 않는다', () => {
    expect(validateRequired('', '이름')).toBe('이름을 입력해 주세요.');
    expect(validateRequired('', '주소')).toBe('주소를 입력해 주세요.');
    expect(validateDate('', '시작일')).toBe('시작일을 입력해 주세요.');
    expect(validateDate('9월 1일', '시작일')).toBe('시작일은 2026-09-01 처럼 적어 주세요.');
    expect(validateTime('9:30', '시작 시각')).toBe('시작 시각은 09:00 처럼 적어 주세요.');
    expect(validateAtLeastOne([], '맡을 수 있는 간병 장소')).toBe(
      '맡을 수 있는 간병 장소를 하나 이상 선택해 주세요.'
    );
    expect(validateAtLeastOne([], '근무 가능 지역')).toBe('근무 가능 지역을 하나 이상 선택해 주세요.');
  });
});

describe('계정 입력', () => {
  it.each([
    ['', false],
    ['name@', false],
    ['name@example', false],
    ['  name@example.com  ', true],
  ])('이메일 %j → 통과 %s', (value, ok) => {
    expect(validateEmail(value) === null).toBe(ok);
  });

  it('비밀번호는 8자 이상, 확인은 같아야 한다', () => {
    expect(validatePassword('1234567')).not.toBeNull();
    expect(validatePassword('12345678')).toBeNull();
    expect(validatePasswordConfirm('12345678', '')).not.toBeNull();
    expect(validatePasswordConfirm('12345678', '12345679')).toBe('비밀번호가 서로 다릅니다.');
  });

  it('이름은 공백을 빼고 2자 이상', () => {
    expect(validateName(' 김 ')).not.toBeNull();
    expect(validateName('김영희')).toBeNull();
  });

  it.each([
    ['', true],
    ['010-1234-5678', true],
    ['01012345678', true],
    ['02-123-4567', true],
    ['1234-5678', false],
  ])('연락처는 선택 입력 %j → 통과 %s', (value, ok) => {
    expect(validatePhone(value) === null).toBe(ok);
  });
});

describe('환자와 요청 입력', () => {
  const now = new Date(2026, 8, 13);

  it.each([
    ['1906', true],
    ['1905', false],
    ['2026', true],
    ['2027', false],
    ['48', false],
    ['천구백', false],
  ])('출생연도 %s → 통과 %s', (value, ok) => {
    expect(validateBirthYear(value, now) === null).toBe(ok);
  });

  it.each([
    ['', true],
    ['120000', true],
    ['120,000', true],
    ['-1', false],
    ['12.5', false],
    ['십이만', false],
  ])('예산 %j → 통과 %s', (value, ok) => {
    expect(validateBudget(value) === null).toBe(ok);
  });

  it('요청 원문은 공백을 빼고 10자 이상', () => {
    expect(validateRequestText('   병원 간병 부탁   ')).not.toBeNull();
    expect(validateRequestText('어머니 병원 간병을 부탁드립니다')).toBeNull();
  });

  it('종료일은 비워도 되지만 시작일보다 빠를 수 없다', () => {
    expect(validateEndDate('2026-09-14', '')).toBeNull();
    expect(validateEndDate('2026-09-14', '2026-09-14')).toBeNull();
    expect(validateEndDate('2026-09-14', '2026-09-13')).toBe('종료일은 시작일보다 빠를 수 없습니다.');
    expect(validateEndDate('2026-09-14', '2026-02-30')).not.toBeNull();
  });

  it('시각은 비워도 되지만 적었다면 HH:MM', () => {
    expect(validateTime('', '시작 시각')).toBeNull();
    expect(validateTime('09:30', '시작 시각')).toBeNull();
    expect(validateTime('24:00', '시작 시각')).not.toBeNull();
    expect(validateTime('9:30', '시작 시각')).not.toBeNull();
  });
});

describe('간병인 프로필 입력', () => {
  it.each([
    ['', false],
    ['0', true],
    ['60', true],
    ['61', false],
    ['2.5', false],
    ['-1', false],
  ])('경력 %j → 통과 %s', (value, ok) => {
    expect(validateYearsOfExperience(value) === null).toBe(ok);
  });
});
