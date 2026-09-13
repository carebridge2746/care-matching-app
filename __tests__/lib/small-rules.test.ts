import { addDays, formatKoreanDate, formatPeriod, isValidIsoDate } from '@/lib/date';
import { canReportNoShow, isMatchOverdue, noShowCountForRequest, overdueMatches } from '@/lib/no-show';
import { ContactRetentionDays, isContactOpen, maskPersonName } from '@/lib/privacy';
import { homeRouteForRole } from '@/lib/routes';
import type { CareMatch, MatchStatus } from '@/types';

describe('날짜', () => {
  it('달과 해를 넘겨 더한다', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('실제로 없는 날짜는 거부한다', () => {
    expect(isValidIsoDate('2026-02-29')).toBe(false);
    expect(isValidIsoDate('2028-02-29')).toBe(true);
    expect(isValidIsoDate('2026-9-1')).toBe(false);
  });

  it('사람이 읽는 형식', () => {
    expect(formatKoreanDate('2026-09-14')).toBe('2026년 9월 14일 (월)');
    expect(formatPeriod('2026-09-14')).toBe('2026년 9월 14일 (월) ~ 종료일 미정');
  });
});

describe('개인정보 가리기', () => {
  it.each([
    ['김영희', '김OO'],
    ['남궁민수', '남OOO'],
    ['  이미영 ', '이OO'],
    ['김', '김'],
    // 사람 이름이 아닌 자리 문구는 가리지 않는다 — '삭OOOO'는 사람 이름으로 읽힌다
    ['삭제된 환자', '삭제된 환자'],
    ['탈퇴한 사용자', '탈퇴한 사용자'],
  ])('%j → %s', (name, expected) => {
    expect(maskPersonName(name)).toBe(expected);
  });
});

describe('연락처를 열어 두는 기간', () => {
  const now = new Date('2026-09-13T00:00:00.000Z');
  const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

  it('성사되지 않은 매칭은 닫혀 있고, 수락·진행중인 간병은 열려 있다', () => {
    expect(isContactOpen({ status: 'cancelled' }, now)).toBe(false);
    expect(isContactOpen({ status: 'noShow' }, now)).toBe(false);
    expect(isContactOpen({ status: 'accepted' }, now)).toBe(true);
    expect(isContactOpen({ status: 'inProgress' }, now)).toBe(true);
  });

  it(`끝난 간병은 종료 뒤 ${ContactRetentionDays}일까지만 열려 있다`, () => {
    expect(isContactOpen({ status: 'completed', completedAt: daysAgo(ContactRetentionDays - 1) }, now)).toBe(true);
    expect(isContactOpen({ status: 'completed', completedAt: daysAgo(ContactRetentionDays) }, now)).toBe(false);
  });
});

describe('노쇼 판정', () => {
  const Today = '2026-09-14';

  function match(
    status: MatchStatus,
    startDate: string,
    requestId = 'request-1',
    dailyStartTime?: string
  ): CareMatch {
    return { status, requestId, care: { startDate, dailyStartTime } } as unknown as CareMatch;
  }

  const at = (hhmm: string, day = Today) => {
    const [h, m] = hhmm.split(':').map(Number);
    const [y, mo, d] = day.split('-').map(Number);
    return new Date(y!, mo! - 1, d!, h, m);
  };

  it('시작일이 지났는데 시작되지 않은 간병만 확인 대상이다', () => {
    expect(isMatchOverdue(match('accepted', '2026-09-13'), Today)).toBe(true);
    expect(isMatchOverdue(match('accepted', Today), Today)).toBe(false);
    expect(isMatchOverdue(match('inProgress', '2026-09-13'), Today)).toBe(false);
  });

  it('신고는 약속한 시작 시각부터 — 당일이라도 시각 전에는 받지 않는다', () => {
    const evening = match('accepted', Today, 'request-1', '17:00');
    expect(canReportNoShow(evening, at('16:59'))).toBe(false);
    expect(canReportNoShow(evening, at('17:00'))).toBe(true);

    // 시각을 적지 않은 요청은 오전 9시로 본다
    expect(canReportNoShow(match('accepted', Today), at('08:59'))).toBe(false);
    expect(canReportNoShow(match('accepted', Today), at('09:00'))).toBe(true);

    expect(canReportNoShow(match('accepted', '2026-09-15'), at('23:59'))).toBe(false);
    expect(canReportNoShow(match('inProgress', Today), at('12:00'))).toBe(false);
  });

  it('확인 대상 모으기와 요청별 노쇼 건수', () => {
    const matches = [
      match('accepted', '2026-09-10'),
      match('accepted', '2026-09-20'),
      match('noShow', '2026-09-01'),
      match('noShow', '2026-09-01', 'request-2'),
    ];
    expect(overdueMatches(matches, Today)).toHaveLength(1);
    expect(noShowCountForRequest(matches, 'request-1')).toBe(1);
  });
});

it('로그인 뒤 유형별 첫 화면', () => {
  expect(homeRouteForRole('guardian')).toBe('/guardian');
  expect(homeRouteForRole('caregiver')).toBe('/caregiver');
  expect(homeRouteForRole('admin')).toBe('/admin');
});
