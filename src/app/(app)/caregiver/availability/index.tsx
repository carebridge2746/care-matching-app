import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AvailabilityGrid } from '@/components/care';
import { AppButton, AppText, EmptyState, LoadingView, Screen } from '@/components/common';
import { summarizeAvailability } from '@/lib/availability';
import { useAuthStore } from '@/store/use-auth-store';
import { useCaregiverProfileStore } from '@/store/use-caregiver-profile-store';
import { Spacing } from '@/theme';
import type { AvailabilitySlot } from '@/types';

/**
 * 근무 가능한 요일과 시간대.
 *
 * 표 전체를 편집하고 한 번에 저장한다. 칸을 누를 때마다 저장하면 화면이 조용히 바뀌어
 * 무엇이 저장됐는지 알기 어렵고, 통신이 끊긴 상태에서 절반만 반영되는 일도 생긴다.
 */
export default function CaregiverAvailabilityScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const profile = useCaregiverProfileStore((state) => state.profile);
  const isLoading = useCaregiverProfileStore((state) => state.isLoading);
  const loadedCaregiverId = useCaregiverProfileStore((state) => state.loadedCaregiverId);
  const load = useCaregiverProfileStore((state) => state.load);

  const caregiverId = user?.id;

  useEffect(() => {
    if (caregiverId && loadedCaregiverId !== caregiverId) {
      void load(caregiverId);
    }
  }, [caregiverId, load, loadedCaregiverId]);

  if (isLoading && !profile) {
    return <LoadingView message="가능 시간을 불러오는 중입니다" />;
  }

  // 시간표만 있고 역량이 없는 간병인은 매칭 대상이 될 수 없다. 저장소도 같은 규칙으로 막는다.
  if (!profile || !caregiverId) {
    return (
      <Screen scroll edges={['bottom']}>
        <EmptyState
          title="프로필을 먼저 등록해 주세요"
          description="어떤 간병을 할 수 있는지 등록해야 가능 시간이 매칭에 쓰입니다."
          actionTitle="프로필 등록"
          onAction={() => router.replace('/caregiver/profile')}
        />
      </Screen>
    );
  }

  // 저장된 시간표가 바뀌면 key 로 표를 다시 만든다 (프로필 화면과 같은 이유)
  return (
    <AvailabilityForm
      key={profile.updatedAt}
      caregiverId={caregiverId}
      initialSlots={profile.availability}
    />
  );
}

type AvailabilityFormProps = {
  caregiverId: string;
  initialSlots: AvailabilitySlot[];
};

function AvailabilityForm({ caregiverId, initialSlots }: AvailabilityFormProps) {
  const router = useRouter();

  const isSubmitting = useCaregiverProfileStore((state) => state.isSubmitting);
  const errorMessage = useCaregiverProfileStore((state) => state.errorMessage);
  const saveAvailability = useCaregiverProfileStore((state) => state.saveAvailability);

  const [slots, setSlots] = useState<AvailabilitySlot[]>(initialSlots);

  const summary = summarizeAvailability(slots);

  const handleSave = async () => {
    const saved = await saveAvailability(caregiverId, slots);
    if (saved) {
      router.replace('/caregiver');
    }
  };

  return (
    <Screen
      scroll
      edges={['bottom']}
      footer={
        <AppButton
          title="가능 시간 저장"
          onPress={() => {
            void handleSave();
          }}
          loading={isSubmitting}
          disabled={isSubmitting}
        />
      }>
      <View style={styles.intro}>
        <AppText variant="body" tone="secondary">
          근무할 수 있는 칸을 눌러 주세요. 요일 이름을 누르면 그 요일이 종일 켜지고 꺼집니다.
        </AppText>
        <AppText variant="bodyStrong" tone={summary ? 'brand' : 'secondary'}>
          {summary ?? '아직 고른 시간이 없습니다'}
        </AppText>
      </View>

      <AvailabilityGrid value={slots} onChange={setSlots} />

      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    paddingTop: Spacing.sm,
    gap: Spacing.sm,
  },
});
