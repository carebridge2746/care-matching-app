import type { CaregiverProfile } from '@/types';

/**
 * Mock 모드에서 처음부터 들어 있는 간병인 프로필.
 *
 * 추천 목록은 비교할 사람이 여럿 있어야 뜻이 있다. 시연용 계정이 하나뿐이면
 * "조건이 맞는 사람이 위로 온다"를 확인할 수가 없어서, 서로 다른 조건의 간병인을 미리 넣어 둔다.
 * Supabase 모드에는 넣지 않는다 — 실제 데이터베이스에 가짜 사람을 만들지 않기 위해서다.
 *
 * id는 src/api/auth.mock.ts 의 시연용 계정과 짝이 맞아야 이름이 함께 보인다.
 * 시각은 고정값이다. 다시 심어도 같은 값이어야 화면이 흔들리지 않는다.
 */

const SeededAt = '2026-01-01T00:00:00.000Z';

export const DemoCaregiverProfiles: CaregiverProfile[] = [
  {
    // 병원 간병 위주의 경력자. 강남 요청에 잘 맞는다.
    id: 'mock-caregiver-2',
    gender: 'female',
    yearsOfExperience: 8,
    certifications: ['요양보호사', '간호조무사'],
    skills: ['식사 보조', '체위 변경', '투약 관리', '흡인(석션)'],
    careTypes: ['hospital', 'facility'],
    regions: ['서울 강남구', '서울 서초구'],
    minDailyWage: 120000,
    introduction: '대학병원 간병 8년차입니다. 수술 후 회복기 어르신을 주로 맡았습니다.',
    availability: [
      { weekday: 'mon', slot: 'morning' },
      { weekday: 'mon', slot: 'afternoon' },
      { weekday: 'tue', slot: 'morning' },
      { weekday: 'tue', slot: 'afternoon' },
      { weekday: 'wed', slot: 'morning' },
      { weekday: 'wed', slot: 'afternoon' },
      { weekday: 'thu', slot: 'morning' },
      { weekday: 'thu', slot: 'afternoon' },
      { weekday: 'fri', slot: 'morning' },
      { weekday: 'fri', slot: 'afternoon' },
    ],
    createdAt: SeededAt,
    updatedAt: SeededAt,
  },
  {
    // 재가 간병만 맡는 신입. 병원 요청에서는 제외 조건에 걸린다.
    id: 'mock-caregiver-3',
    gender: 'male',
    yearsOfExperience: 2,
    certifications: ['요양보호사'],
    skills: ['식사 보조', '말벗·정서 지원', '병원 동행'],
    careTypes: ['home'],
    regions: ['서울 송파구'],
    minDailyWage: 150000,
    introduction: '어르신 말벗과 병원 동행을 주로 했습니다. 야간 간병도 가능합니다.',
    availability: [
      { weekday: 'tue', slot: 'afternoon' },
      { weekday: 'tue', slot: 'night' },
      { weekday: 'thu', slot: 'afternoon' },
      { weekday: 'thu', slot: 'night' },
      { weekday: 'sat', slot: 'afternoon' },
      { weekday: 'sat', slot: 'night' },
    ],
    createdAt: SeededAt,
    updatedAt: SeededAt,
  },
];
