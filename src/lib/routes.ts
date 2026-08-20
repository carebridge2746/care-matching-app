import type { UserRole } from '@/types';

/**
 * 사용자 유형별 첫 화면.
 *
 * 로그인 이후 어디로 보낼지는 여기서만 결정한다.
 * 화면 안에서 역할을 보고 직접 경로를 조립하지 않는다.
 */
export const RoleHomeRoutes = {
  guardian: '/guardian',
  caregiver: '/caregiver',
  admin: '/admin',
} as const satisfies Record<UserRole, string>;

export type RoleHomeRoute = (typeof RoleHomeRoutes)[UserRole];

export function homeRouteForRole(role: UserRole): RoleHomeRoute {
  return RoleHomeRoutes[role];
}
