import { RoleHome } from '@/components/home/role-home';

export default function CaregiverHomeScreen() {
  return (
    <RoleHome
      description="역량과 가능한 시간을 등록해 두면 조건이 맞는 간병 요청을 추천받습니다."
      nextSteps={[
        {
          title: '프로필과 역량 등록',
          detail: '경력, 가능한 간병 유형, 자격증을 등록합니다. (Phase 5)',
        },
        {
          title: '가능 시간 설정',
          detail: '요일과 시간대를 등록해 매칭 대상에 포함됩니다. (Phase 5)',
        },
        {
          title: '요청 수락과 간병 진행',
          detail: '도착한 요청을 확인하고 수락한 뒤 진행 상태를 기록합니다. (Phase 7)',
        },
      ]}
    />
  );
}
