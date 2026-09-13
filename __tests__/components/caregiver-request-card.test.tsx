import { render, screen } from '@testing-library/react-native';

import { CaregiverRequestCard } from '@/components/care/caregiver-request-card';
import type { CaregiverCareRequest } from '@/types';

const base: CaregiverCareRequest = {
  id: 'request-1',
  careType: 'hospital',
  region: '서울 강남구',
  startDate: '2026-09-14',
  requiredSkills: [],
  preferredCaregiverGender: 'any',
  status: 'pending',
  createdAt: '2026-09-13T00:00:00.000Z',
  updatedAt: '2026-09-13T00:00:00.000Z',
  patient: { name: '김OO', birthYear: 1945, gender: 'female', mobility: 'assisted', cognition: 'mild', conditions: [] },
};

describe('CaregiverRequestCard', () => {
  it('수락 전에는 원문 없이 조건만 보인다', () => {
    render(<CaregiverRequestCard request={base} />);

    expect(screen.getByText('김OO · 81세 여성')).toBeOnTheScreen();
    expect(screen.queryByText(/입원 중/)).toBeNull();
  });

  it('수락한 요청에는 원문이 함께 보인다', () => {
    render(<CaregiverRequestCard request={{ ...base, requestText: '어머니가 입원 중입니다.' }} />);

    expect(screen.getByText('어머니가 입원 중입니다.')).toBeOnTheScreen();
  });
});
