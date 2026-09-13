import { fireEvent, render, screen } from '@testing-library/react-native';

import { MatchCard } from '@/components/care/match-card';
import { addDays, today } from '@/lib/date';
import type { CareMatch } from '@/types';

function makeMatch(overrides: Partial<CareMatch> = {}): CareMatch {
  return {
    id: 'match-1',
    requestId: 'request-1',
    guardianId: 'mock-guardian-1',
    caregiverId: 'mock-caregiver-2',
    status: 'accepted',
    acceptedAt: '2026-09-01T03:00:00.000Z',
    createdAt: '2026-09-01T03:00:00.000Z',
    updatedAt: '2026-09-01T03:00:00.000Z',
    care: {
      requestText: '어머니 병원 간병',
      careType: 'hospital',
      region: '서울 강남구',
      startDate: addDays(today(), 3),
      requiredSkills: [],
    },
    patient: { name: '김순자', birthYear: 1945, gender: 'female', mobility: 'assisted', cognition: 'mild', conditions: [] },
    caregiver: { name: '이미영', phone: '010-2345-6789' },
    guardian: { name: '김영희' },
    ...overrides,
  } as CareMatch;
}

describe('MatchCard', () => {
  describe('끝난 간병의 후기 자리', () => {
    const completed = makeMatch({ status: 'completed', completedAt: '2026-09-05T03:00:00.000Z' });

    it('후기를 남기지 않았으면 버튼', () => {
      render(<MatchCard match={completed} viewer="guardian" onReview={jest.fn()} />);
      expect(screen.getByRole('button', { name: '후기 남기기' })).toBeOnTheScreen();
    });

    it('남겼으면 그 사실', () => {
      render(<MatchCard match={completed} viewer="guardian" reviewed onReview={jest.fn()} />);
      expect(screen.getByText('후기를 남기셨습니다')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: '후기 남기기' })).toBeNull();
    });

    it('관리자가 지웠으면 다시 쓸 수 없다는 것까지', () => {
      render(<MatchCard match={completed} viewer="guardian" reviewed reviewDeleted onReview={jest.fn()} />);
      expect(screen.getByText(/신고 확인을 거쳐 삭제되었습니다/)).toBeOnTheScreen();
      expect(screen.queryByText('후기를 남기셨습니다')).toBeNull();
    });
  });

  it('끝난 지 오래된 간병은 연락처를 가린 이유를 알려 준다', () => {
    const longAgo = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const old = makeMatch({ status: 'completed', completedAt: longAgo, caregiver: { name: '이OO' } });
    render(<MatchCard match={old} viewer="guardian" reviewed />);

    expect(screen.getByText(/연락처를 가렸습니다/)).toBeOnTheScreen();
  });

  it('관리자가 끊은 매칭은 보호자가 취소한 것으로 보이지 않는다', () => {
    const cancelled = makeMatch({
      status: 'cancelled',
      cancelledAt: '2026-09-05T03:00:00.000Z',
      cancelledBy: 'admin',
      cancelReason: '종료 확인',
    });
    render(<MatchCard match={cancelled} viewer="caregiver" />);

    expect(screen.getByText(/관리자.*취소/)).toBeOnTheScreen();
    expect(screen.queryByText(/보호자.*취소/)).toBeNull();
  });

  describe('간병 시작', () => {
    it('시작일 전에는 버튼 대신 언제부터 누를 수 있는지 알려 준다', () => {
      render(<MatchCard match={makeMatch()} viewer="caregiver" onStart={jest.fn()} onCancel={jest.fn()} />);

      expect(screen.queryByRole('button', { name: '간병 시작' })).toBeNull();
      expect(screen.getByText(/부터 간병 시작을 누를 수 있습니다/)).toBeOnTheScreen();
    });

    it('시작일이 되면 버튼이 보인다', () => {
      const startsToday = makeMatch({ care: { ...makeMatch().care, startDate: today() } });
      const onStart = jest.fn();
      render(<MatchCard match={startsToday} viewer="caregiver" onStart={onStart} />);

      fireEvent.press(screen.getByRole('button', { name: '간병 시작' }));
      expect(onStart).toHaveBeenCalled();
    });
  });

  it('간병 종료는 되돌릴 수 없어서 한 번 더 묻는다', () => {
    const inProgress = makeMatch({ status: 'inProgress', startedAt: '2026-09-02T03:00:00.000Z' });
    const onComplete = jest.fn();
    render(<MatchCard match={inProgress} viewer="guardian" onComplete={onComplete} onCancel={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: '간병 종료' }));
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByText('간병을 종료할까요?')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: '아니요' }));
    expect(screen.queryByText('간병을 종료할까요?')).toBeNull();

    fireEvent.press(screen.getByRole('button', { name: '간병 종료' }));
    fireEvent.press(screen.getByRole('button', { name: '네, 종료합니다' }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('카드 전체를 버튼으로 두지 않고, 상세로 가는 길은 링크로 둔다 — 버튼 안에 버튼이 들어가지 않게', () => {
    const onPress = jest.fn();
    render(<MatchCard match={makeMatch()} viewer="guardian" onPress={onPress} onCancel={jest.fn()} />);

    // 버튼은 취소 하나뿐이다. 카드가 버튼이면 여기에 하나 더 잡힌다.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.press(screen.getByRole('link', { name: /요청 자세히 보기/ }));
    expect(onPress).toHaveBeenCalled();
  });

  describe('노쇼 신고 버튼', () => {
    const startedToday = makeMatch({ care: { ...makeMatch().care, startDate: today() } });

    it('시작일이 온 간병의 보호자에게만 보인다', () => {
      render(<MatchCard match={startedToday} viewer="guardian" onReportNoShow={jest.fn()} />);
      expect(screen.getByRole('button', { name: '간병인이 오지 않았습니다' })).toBeOnTheScreen();
    });

    it('간병인에게는 보이지 않는다', () => {
      render(<MatchCard match={startedToday} viewer="caregiver" onReportNoShow={jest.fn()} />);
      expect(screen.queryByRole('button', { name: '간병인이 오지 않았습니다' })).toBeNull();
    });

    it('시작일 전에는 보이지 않는다', () => {
      render(<MatchCard match={makeMatch()} viewer="guardian" onReportNoShow={jest.fn()} />);
      expect(screen.queryByRole('button', { name: '간병인이 오지 않았습니다' })).toBeNull();
    });
  });
});
