import { fireEvent, render, screen } from '@testing-library/react-native';

import { AdminNoteForm } from '@/components/admin/admin-note-form';

function renderForm(onConfirm = jest.fn()) {
  render(
    <AdminNoteForm
      title="후기를 삭제할까요?"
      consequences={['평균 별점에서 빠집니다', '나중에 복구할 수 있습니다']}
      noteLabel="삭제 사유"
      notePlaceholder="예: 욕설이 포함되어 있음"
      confirmTitle="후기 삭제"
      confirmVariant="danger"
      onConfirm={onConfirm}
      onDismiss={jest.fn()}
    />
  );
  return onConfirm;
}

describe('AdminNoteForm', () => {
  it('누르면 무슨 일이 일어나는지 한 줄씩 먼저 보여 준다', () => {
    renderForm();
    expect(screen.getByText('· 평균 별점에서 빠집니다\n· 나중에 복구할 수 있습니다')).toBeOnTheScreen();
  });

  it('사유를 적기 전에는 조치할 수 없다 — 공백만 적어도 마찬가지다', () => {
    const onConfirm = renderForm();
    const button = () => screen.getByRole('button', { name: '후기 삭제' });

    expect(button()).toBeDisabled();

    fireEvent.changeText(screen.getByPlaceholderText('예: 욕설이 포함되어 있음'), '   ');
    expect(button()).toBeDisabled();

    fireEvent.changeText(screen.getByPlaceholderText('예: 욕설이 포함되어 있음'), '욕설 포함');
    expect(button()).toBeEnabled();

    fireEvent.press(button());
    expect(onConfirm).toHaveBeenCalledWith('욕설 포함');
  });
});
