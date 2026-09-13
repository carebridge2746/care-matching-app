import { fireEvent, render, screen } from '@testing-library/react-native';

import { ReviewReportForm } from '@/components/care/review-report-form';

describe('ReviewReportForm', () => {
  it('사유를 고르기 전에는 신고할 수 없다', () => {
    const onSubmit = jest.fn();
    render(<ReviewReportForm onSubmit={onSubmit} onDismiss={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: '신고하기' }));

    expect(screen.getByRole('button', { name: '신고하기' })).toBeDisabled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('고른 사유와 적은 설명을 보낸다', () => {
    const onSubmit = jest.fn();
    render(<ReviewReportForm onSubmit={onSubmit} onDismiss={jest.fn()} />);

    fireEvent.press(screen.getByRole('radio', { name: '사실과 다른 내용' }));
    fireEvent.changeText(
      screen.getByPlaceholderText('어느 부분이 문제인지 적어 주시면 확인이 빨라집니다'),
      '간병 기간이 다르게 적혀 있습니다'
    );
    fireEvent.press(screen.getByRole('button', { name: '신고하기' }));

    expect(onSubmit).toHaveBeenCalledWith({ reason: 'falseInfo', detail: '간병 기간이 다르게 적혀 있습니다' });
  });

  it('공백만 적은 설명은 보내지 않는다', () => {
    const onSubmit = jest.fn();
    render(<ReviewReportForm onSubmit={onSubmit} onDismiss={jest.fn()} />);

    fireEvent.press(screen.getByRole('radio', { name: '욕설이나 비방' }));
    fireEvent.changeText(screen.getByPlaceholderText(/어느 부분이 문제인지/), '   ');
    fireEvent.press(screen.getByRole('button', { name: '신고하기' }));

    expect(onSubmit).toHaveBeenCalledWith({ reason: 'abuse' });
  });

  it('보내는 중에는 닫을 수 없다', () => {
    const onDismiss = jest.fn();
    render(<ReviewReportForm busy onSubmit={jest.fn()} onDismiss={onDismiss} />);

    expect(screen.getByRole('button', { name: '닫기' })).toBeDisabled();
  });
});
