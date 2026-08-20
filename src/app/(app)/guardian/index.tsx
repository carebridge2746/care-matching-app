import { RoleHome } from '@/components/home/role-home';

export default function GuardianHomeScreen() {
  return (
    <RoleHome
      description="환자 정보를 등록하고 필요한 간병을 평소 말하듯 적으면 AI가 조건을 정리해 드립니다."
      nextSteps={[
        {
          title: '환자 정보 등록',
          detail: '연세, 질환, 거동 상태 등 간병에 필요한 정보를 저장합니다. (Phase 3)',
        },
        {
          title: '간병 요청 작성',
          detail: '자연어로 적은 요청을 AI가 조건으로 바꿔 줍니다. (Phase 3~4)',
        },
        {
          title: '추천 간병인 확인',
          detail: '점수 기반 매칭으로 정렬된 간병인을 비교하고 선택합니다. (Phase 6)',
        },
      ]}
    />
  );
}
