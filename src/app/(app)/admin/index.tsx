import { RoleHome } from '@/components/home/role-home';

export default function AdminHomeScreen() {
  return (
    <RoleHome
      description="사용자, 요청, 매칭 현황을 확인하고 문제가 생긴 건을 처리합니다."
      nextSteps={[
        {
          title: '사용자 관리',
          detail: '보호자와 간병인 계정, 자격 승인 상태를 관리합니다. (Phase 11)',
        },
        {
          title: '요청·매칭 현황',
          detail: '진행 중인 요청과 매칭 결과를 한눈에 봅니다. (Phase 11)',
        },
        {
          title: '노쇼 처리',
          detail: '노쇼가 발생한 건에 대체 간병인을 추천합니다. (Phase 10)',
        },
      ]}
    />
  );
}
