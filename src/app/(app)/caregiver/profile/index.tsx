import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  ChoiceGroup,
  LoadingView,
  MultiChoiceGroup,
  Screen,
  TagField,
  TextField,
  type ChoiceOption,
} from '@/components/common';
import { ReviewList } from '@/components/care';
import { CompletionList } from '@/components/training';
import { CommonCareSkills, CommonCertifications } from '@/lib/care-options';
import { validateAtLeastOne, validateBudget, validateYearsOfExperience } from '@/lib/validation';
import { useAuthStore } from '@/store/use-auth-store';
import { useCaregiverProfileStore } from '@/store/use-caregiver-profile-store';
import { useReviewsStore } from '@/store/use-reviews-store';
import { useTrainingStore } from '@/store/use-training-store';
import { Spacing } from '@/theme';
import { CareTypeLabels, GenderLabels, type CaregiverProfile, type CareType, type Gender } from '@/types';

const GenderOptions: ChoiceOption<Gender>[] = [
  { value: 'female', label: GenderLabels.female },
  { value: 'male', label: GenderLabels.male },
  { value: 'other', label: GenderLabels.other },
];

/**
 * 맡을 수 있는 간병 장소.
 * MultiChoiceGroup 은 문자열 목록을 받으므로 라벨로 고르고 저장 직전에 값으로 되돌린다.
 */
const CareTypeOptions = [
  CareTypeLabels.hospital,
  CareTypeLabels.home,
  CareTypeLabels.facility,
] as const;

const CareTypeByLabel: Record<string, CareType> = {
  [CareTypeLabels.hospital]: 'hospital',
  [CareTypeLabels.home]: 'home',
  [CareTypeLabels.facility]: 'facility',
};

/**
 * 간병인 프로필과 역량.
 *
 * 등록과 수정을 한 화면에서 한다. 프로필은 한 사람당 하나뿐이라 목록이 필요 없고,
 * 처음 등록한 뒤에도 자격이나 지역이 늘어나면 같은 폼을 다시 열게 된다.
 *
 * 여기서 고른 값이 Phase 6 매칭 점수의 입력이 된다 —
 * 역량은 요청의 필요 역량과, 지역은 요청의 지역과, 성별은 보호자의 성별 선호와 맞춰 본다.
 */
export default function CaregiverProfileScreen() {
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

  // 아직 등록하지 않은 간병인은 불러오기가 끝나도 profile 이 null 이다.
  // 그 상태는 로딩이 아니라 빈 폼이므로, 기다리는 동안에만 로딩을 보여 준다.
  if (isLoading && !profile) {
    return <LoadingView message="프로필을 불러오는 중입니다" />;
  }
  if (!caregiverId) {
    return null;
  }

  // 불러온 값이 바뀌면 key 로 폼을 통째로 다시 만든다.
  // 그래야 초기값을 useState 에 한 번만 넣으면 되고, effect 로 입력값을 되맞출 필요가 없다.
  return (
    <ProfileForm
      key={profile?.updatedAt ?? 'new'}
      caregiverId={caregiverId}
      profile={profile}
    />
  );
}

type ProfileFormProps = {
  caregiverId: string;
  /** 아직 등록 전이면 null */
  profile: CaregiverProfile | null;
};

/**
 * 지금까지 받은 평가.
 *
 * 프로필 화면에 두는 이유는 보호자가 보는 것과 같은 값이기 때문이다 —
 * 내가 어떻게 보이는지를 프로필과 같은 자리에서 확인할 수 있어야 한다.
 * 작성자 이름은 본인에게도 성만 보인다.
 */
function ReceivedReviews({ caregiverId }: { caregiverId: string }) {
  const rating = useReviewsStore((state) => state.rating);
  const received = useReviewsStore((state) => state.received);
  const load = useReviewsStore((state) => state.load);

  useEffect(() => {
    void load(caregiverId);
  }, [caregiverId, load]);

  return (
    <View style={styles.section}>
      <AppText variant="heading">받은 평가</AppText>
      <ReviewList
        rating={rating}
        reviews={received}
        emptyMessage="간병을 마치면 보호자가 남긴 후기가 여기에 쌓입니다."
      />
    </View>
  );
}

/**
 * 수료한 교육.
 *
 * 아래 '보유 자격'과 한 화면에 있지만 같은 칸에 넣지 않는다.
 * 보유 자격은 간병인이 직접 고른 값이고 이쪽은 퀴즈로 확인된 값이라,
 * 섞어 두면 보호자가 무엇이 확인된 것인지 알 수 없게 된다.
 */
function CompletedTraining({ caregiverId }: { caregiverId: string }) {
  const router = useRouter();
  const courses = useTrainingStore((state) => state.courses);
  const completions = useTrainingStore((state) => state.completions);
  const load = useTrainingStore((state) => state.load);

  useEffect(() => {
    void load(caregiverId);
  }, [caregiverId, load]);

  return (
    <View style={styles.section}>
      <AppText variant="heading">수료한 교육</AppText>
      <CompletionList
        courses={courses}
        completions={completions}
        emptyMessage="교육을 마치면 수료한 과정이 여기에 쌓입니다."
      />
      <AppButton
        title="교육 과정 보기"
        variant="outline"
        onPress={() => router.push('/caregiver/training')}
      />
    </View>
  );
}

function ProfileForm({ caregiverId, profile }: ProfileFormProps) {
  const router = useRouter();

  const isSubmitting = useCaregiverProfileStore((state) => state.isSubmitting);
  const errorMessage = useCaregiverProfileStore((state) => state.errorMessage);
  const saveProfile = useCaregiverProfileStore((state) => state.saveProfile);

  const [gender, setGender] = useState<Gender | null>(profile?.gender ?? null);
  const [years, setYears] = useState(
    profile ? String(profile.yearsOfExperience) : ''
  );
  const [certifications, setCertifications] = useState<string[]>(profile?.certifications ?? []);
  const [skills, setSkills] = useState<string[]>(profile?.skills ?? []);
  const [careTypeLabels, setCareTypeLabels] = useState<string[]>(
    profile?.careTypes.map((careType) => CareTypeLabels[careType]) ?? []
  );
  const [regions, setRegions] = useState<string[]>(profile?.regions ?? []);
  const [wage, setWage] = useState(
    profile?.minDailyWage !== undefined ? String(profile.minDailyWage) : ''
  );
  const [introduction, setIntroduction] = useState(profile?.introduction ?? '');

  const [errors, setErrors] = useState<Record<string, string | null>>({});

  const handleSubmit = async () => {
    const nextErrors: Record<string, string | null> = {
      gender: gender ? null : '성별을 선택해 주세요.',
      years: validateYearsOfExperience(years),
      // 자격은 없어도 등록할 수 있다. 자격증이 있어야만 간병을 할 수 있는 것은 아니다.
      skills: validateAtLeastOne(skills, '할 수 있는 간병'),
      careTypes: validateAtLeastOne(careTypeLabels, '맡을 수 있는 간병 장소'),
      regions: validateAtLeastOne(regions, '근무 가능 지역'),
      wage: validateBudget(wage),
    };

    setErrors(nextErrors);

    if (!gender || Object.values(nextErrors).some((error) => error !== null)) {
      return;
    }

    const saved = await saveProfile(caregiverId, {
      gender,
      yearsOfExperience: Number(years.trim()),
      certifications,
      skills,
      careTypes: careTypeLabels.map((label) => CareTypeByLabel[label]).filter(Boolean),
      regions,
      minDailyWage: wage.trim() ? Number(wage.trim().replace(/,/g, '')) : undefined,
      introduction: introduction.trim() || undefined,
    });

    if (saved) {
      // 프로필만 있고 시간표가 없으면 매칭 대상이 되지 않는다. 바로 다음 칸으로 보낸다.
      router.replace(saved.availability.length === 0 ? '/caregiver/availability' : '/caregiver');
    }
  };

  return (
    <Screen
      scroll
      avoidKeyboard
      edges={['bottom']}
      footer={
        <AppButton
          title={profile ? '프로필 저장' : '프로필 등록'}
          onPress={() => {
            void handleSubmit();
          }}
          loading={isSubmitting}
          disabled={isSubmitting}
        />
      }>
      <View style={styles.intro}>
        <AppText variant="body" tone="secondary">
          여기에 적은 내용으로 조건이 맞는 간병 요청을 찾아 드립니다. 보호자에게는 이름과
          자기소개, 경력과 자격, 그리고 지금까지 받은 평가가 보입니다.
        </AppText>
      </View>

      <ReceivedReviews caregiverId={caregiverId} />

      <CompletedTraining caregiverId={caregiverId} />

      <View style={styles.section}>
        <AppText variant="heading">기본 정보</AppText>
        <ChoiceGroup
          label="성별"
          options={GenderOptions}
          value={gender}
          onChange={(value) => {
            setGender(value);
            setErrors((previous) => ({ ...previous, gender: null }));
          }}
          error={errors.gender}
          helperText="보호자가 간병인 성별을 지정한 요청과 맞춰 봅니다."
        />
        <TextField
          label="간병 경력 (년)"
          value={years}
          onChangeText={(value) => {
            setYears(value);
            setErrors((previous) => ({ ...previous, years: null }));
          }}
          placeholder="3"
          error={errors.years}
          helperText="경력이 없으면 0을 적어 주세요."
          keyboardType="number-pad"
        />
      </View>

      <View style={styles.section}>
        <AppText variant="heading">자격과 역량</AppText>
        <MultiChoiceGroup
          label="보유 자격 (해당하는 것 모두)"
          options={CommonCertifications}
          values={certifications}
          onChange={setCertifications}
          helperText="자격이 없어도 등록할 수 있습니다. 자격이 있으면 매칭에서 먼저 추천됩니다."
        />
        <MultiChoiceGroup
          label="할 수 있는 간병 (해당하는 것 모두)"
          options={CommonCareSkills}
          values={skills}
          onChange={(values) => {
            setSkills(values);
            setErrors((previous) => ({ ...previous, skills: null }));
          }}
          error={errors.skills}
          helperText="보호자가 요청에 적은 필요 역량과 겹치는 만큼 추천 순위가 올라갑니다."
        />
        <MultiChoiceGroup
          label="맡을 수 있는 간병 장소"
          options={CareTypeOptions}
          values={careTypeLabels}
          onChange={(values) => {
            setCareTypeLabels(values);
            setErrors((previous) => ({ ...previous, careTypes: null }));
          }}
          error={errors.careTypes}
        />
      </View>

      <View style={styles.section}>
        <AppText variant="heading">근무 조건</AppText>
        <TagField
          label="근무 가능 지역"
          values={regions}
          onChange={(values) => {
            setRegions(values);
            setErrors((previous) => ({ ...previous, regions: null }));
          }}
          placeholder="서울 강남구"
          error={errors.regions}
          helperText="한 번에 한 곳씩 적고 '추가'를 눌러 주세요. 시군구 단위로 적으면 잘 맞습니다."
        />
        <TextField
          label="희망 일당 (선택)"
          value={wage}
          onChangeText={(value) => {
            setWage(value);
            setErrors((previous) => ({ ...previous, wage: null }));
          }}
          placeholder="120000"
          error={errors.wage}
          helperText="비워 두면 협의로 봅니다. 보호자의 예산과 맞춰 추천 순위를 정합니다."
          keyboardType="number-pad"
        />
        <TextField
          label="자기소개 (선택)"
          value={introduction}
          onChangeText={setIntroduction}
          placeholder="병원 간병 위주로 5년간 일했습니다. 거동이 어려우신 어르신 체위 변경과 식사 보조에 익숙합니다."
          helperText="보호자가 간병인을 고를 때 함께 봅니다."
          multiline
        />
      </View>

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
  },
  section: {
    paddingTop: Spacing.sm,
    gap: Spacing.lg,
  },
});
