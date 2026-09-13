import { fireEvent, render, screen } from '@testing-library/react-native';

import { CaregiverArrivalPanel, GuardianArrivalStatus } from '@/components/arrival';
import { emptyLocationSharing } from '@/lib/arrival';
import type { CareMatch, LocationSharing } from '@/types';

// 2026-09-14 10:00 시작 간병을, 공유 시간대 안인 09:00 에 본다
const now = new Date(2026, 8, 14, 9, 0);

const match = {
  id: 'match-1',
  requestId: 'request-1',
  guardianId: 'mock-guardian-1',
  caregiverId: 'mock-caregiver-2',
  status: 'accepted',
  acceptedAt: '2026-09-13T03:00:00.000Z',
  createdAt: '2026-09-13T03:00:00.000Z',
  updatedAt: '2026-09-13T03:00:00.000Z',
  care: { careType: 'hospital', region: '서울 강남구', startDate: '2026-09-14', dailyStartTime: '10:00', requiredSkills: [] },
  patient: { name: '김순자', birthYear: 1945, gender: 'female', mobility: 'assisted', cognition: 'mild', conditions: [] },
  caregiver: { name: '이미영' },
  guardian: { name: '김영희' },
} as CareMatch;

function sharing(extra: Partial<LocationSharing> = {}): LocationSharing {
  return { ...emptyLocationSharing('match-1'), ...extra };
}

describe('CaregiverArrivalPanel', () => {
  it('동의하기 전에는 이동 시작 버튼이 없고, 안내를 보여 준 뒤 동의를 받는다', () => {
    const onAction = jest.fn();
    render(<CaregiverArrivalPanel match={match} sharing={sharing()} onAction={onAction} now={now} />);

    expect(screen.queryByRole('button', { name: '이동 시작' })).toBeNull();
    expect(screen.getByText(/정확한 위치가 아니라 이동 상태와 예상 도착 시각만/)).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: '안내를 확인했고 동의합니다' }));
    expect(onAction).toHaveBeenCalledWith('giveConsent');
  });

  it('동의한 뒤에는 이동 시작, 이동 전에는 공유 중지 버튼이 없다', () => {
    render(<CaregiverArrivalPanel match={match} sharing={sharing({ consentGiven: true })} onAction={jest.fn()} now={now} />);

    expect(screen.getByRole('button', { name: '이동 시작' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '위치 공유 일시 중지' })).toBeNull();
    expect(screen.queryByRole('button', { name: '위치 공유 종료' })).toBeNull();
  });

  it('이동 중에는 인근·도착·일시 중지·종료, 일시 중지 중에는 재개', () => {
    const { rerender } = render(
      <CaregiverArrivalPanel match={match} sharing={sharing({ consentGiven: true, status: 'sharing' })} onAction={jest.fn()} now={now} />
    );
    for (const name of ['약속 장소 인근', '도착 완료', '위치 공유 일시 중지', '위치 공유 종료']) {
      expect(screen.getByRole('button', { name })).toBeOnTheScreen();
    }

    rerender(
      <CaregiverArrivalPanel match={match} sharing={sharing({ consentGiven: true, status: 'paused' })} onAction={jest.fn()} now={now} />
    );
    expect(screen.getByRole('button', { name: '위치 공유 재개' })).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: '위치 공유 일시 중지' })).toBeNull();
  });

  it('도착 완료 후에는 이동 관련 버튼을 숨긴다', () => {
    render(
      <CaregiverArrivalPanel
        match={match}
        sharing={sharing({ consentGiven: true, status: 'arrived', arrivedAt: new Date(2026, 8, 14, 9, 50).toISOString() })}
        onAction={jest.fn()}
        now={now}
      />
    );
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText(/도착을 알렸습니다/)).toBeOnTheScreen();
  });

  it('공유 시간대 전이나 이미 시작한 간병에는 이동 버튼을 보여 주지 않는다', () => {
    const early = new Date(2026, 8, 14, 5, 0);
    const { rerender } = render(<CaregiverArrivalPanel match={match} sharing={sharing({ consentGiven: true })} onAction={jest.fn()} now={early} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText(/3시간 전부터 이동을 알릴 수 있습니다/)).toBeOnTheScreen();

    rerender(<CaregiverArrivalPanel match={{ ...match, status: 'completed' }} sharing={sharing()} onAction={jest.fn()} now={now} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('GuardianArrivalStatus', () => {
  it('11. 간병인이 위치 공유를 중지하면 보호자에게 그 사실이 보인다', () => {
    render(<GuardianArrivalStatus match={match} sharing={sharing({ status: 'paused', stoppedAt: now.toISOString() })} now={now} />);

    expect(screen.getByText('돌봄제공자가 위치 공유를 중지했습니다')).toBeOnTheScreen();
    expect(screen.getByText(/공유를 다시 켜면/)).toBeOnTheScreen();
    expect(screen.queryByText(/이동을 시작하면/)).toBeNull();
  });

  it('이동 중이면 예상 도착과 마지막 업데이트를 보여 주고, 좌표는 보여 주지 않는다', () => {
    const moving = sharing({
      status: 'sharing',
      estimatedArrivalAt: new Date(2026, 8, 14, 9, 40).toISOString(),
      lastUpdatedAt: new Date(2026, 8, 14, 9, 0).toISOString(),
    });
    render(<GuardianArrivalStatus match={match} sharing={moving} now={now} />);

    // 판단 배지와 상태 문장이 이동 중일 때만 같은 말을 한다
    expect(screen.getAllByText('이동 중')).toHaveLength(2);
    expect(screen.getByText(/예상 도착 09:40 · 마지막 업데이트 09:00/)).toBeOnTheScreen();
    expect(screen.getByText(/정확한 위치가 아니라/)).toBeOnTheScreen();
  });

  it('시작 시각이 지나도 오지 않으면 확인 필요로 안내하되, 노쇼로 처리했다고 말하지 않는다', () => {
    render(<GuardianArrivalStatus match={match} sharing={sharing()} now={new Date(2026, 8, 14, 10, 30)} />);

    expect(screen.getByText('확인 필요')).toBeOnTheScreen();
    expect(screen.getByText(/위치 정보만으로 노쇼로 처리되지 않으며/)).toBeOnTheScreen();
  });
});
