/**
 * 앱 전역 도메인 타입.
 * 각 Phase에서 필요한 타입만 점진적으로 추가한다.
 */

/** 사용자 유형 — 보호자 / 간병인 / 관리자 */
export type UserRole = 'guardian' | 'caregiver' | 'admin';

export const RoleLabels: Record<UserRole, string> = {
  guardian: '보호자',
  caregiver: '간병인',
  admin: '관리자',
};

/** 로그인한 사용자 정보 (Supabase Auth 사용자 + profiles 테이블 병합 결과) */
export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
};
