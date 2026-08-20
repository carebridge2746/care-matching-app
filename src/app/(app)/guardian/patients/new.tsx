import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  ChoiceGroup,
  MultiChoiceGroup,
  Screen,
  TextField,
  type ChoiceOption,
} from '@/components/common';
import { CommonConditions } from '@/lib/care-options';
import { validateBirthYear, validateRequired } from '@/lib/validation';
import { useAuthStore } from '@/store/use-auth-store';
import { usePatientsStore } from '@/store/use-patients-store';
import { Spacing } from '@/theme';
import {
  CognitionLabels,
  GenderLabels,
  MobilityLabels,
  type CognitionLevel,
  type Gender,
  type MobilityLevel,
} from '@/types';

const GenderOptions: ChoiceOption<Gender>[] = [
  { value: 'female', label: GenderLabels.female },
  { value: 'male', label: GenderLabels.male },
  { value: 'other', label: GenderLabels.other },
];

const MobilityOptions: ChoiceOption<MobilityLevel>[] = [
  { value: 'independent', label: MobilityLabels.independent },
  { value: 'assisted', label: MobilityLabels.assisted },
  { value: 'wheelchair', label: MobilityLabels.wheelchair },
  { value: 'bedridden', label: MobilityLabels.bedridden },
];

const CognitionOptions: ChoiceOption<CognitionLevel>[] = [
  { value: 'normal', label: CognitionLabels.normal },
  { value: 'mild', label: CognitionLabels.mild },
  { value: 'severe', label: CognitionLabels.severe },
];

/**
 * 환자 등록.
 *
 * 여기서 모은 정보가 매칭 점수의 바탕이 된다.
 * 그래서 거동·인지 상태와 질환은 자유 입력이 아니라 정해진 항목에서 고르게 한다.
 */
export default function PatientNewScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const create = usePatientsStore((state) => state.create);
  const isSubmitting = usePatientsStore((state) => state.isSubmitting);
  const errorMessage = usePatientsStore((state) => state.errorMessage);
  const clearError = usePatientsStore((state) => state.clearError);

  const [name, setName] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [gender, setGender] = useState<Gender | null>(null);
  const [relationship, setRelationship] = useState('');
  const [conditions, setConditions] = useState<string[]>([]);
  const [mobility, setMobility] = useState<MobilityLevel | null>(null);
  const [cognition, setCognition] = useState<CognitionLevel>('normal');
  const [careNotes, setCareNotes] = useState('');

  const [nameError, setNameError] = useState<string | null>(null);
  const [birthYearError, setBirthYearError] = useState<string | null>(null);
  const [genderError, setGenderError] = useState<string | null>(null);
  const [mobilityError, setMobilityError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!user) {
      return;
    }

    const nextNameError = validateRequired(name, '이름');
    const nextBirthYearError = validateBirthYear(birthYear);
    const nextGenderError = gender ? null : '성별을 선택해 주세요.';
    const nextMobilityError = mobility ? null : '거동 상태를 선택해 주세요.';

    setNameError(nextNameError);
    setBirthYearError(nextBirthYearError);
    setGenderError(nextGenderError);
    setMobilityError(nextMobilityError);

    if (nextNameError || nextBirthYearError || !gender || !mobility) {
      return;
    }

    const patient = await create(user.id, {
      name,
      birthYear: Number(birthYear.trim()),
      gender,
      relationship,
      conditions,
      mobility,
      cognition,
      careNotes,
    });

    if (patient) {
      router.back();
    }
  };

  return (
    <Screen
      scroll
      avoidKeyboard
      edges={['bottom']}
      footer={
        <AppButton
          title="저장"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
        />
      }>
      <View style={styles.section}>
        <AppText variant="heading">기본 정보</AppText>
        <TextField
          label="이름"
          value={name}
          onChangeText={(value) => {
            setName(value);
            setNameError(null);
            clearError();
          }}
          placeholder="김순자"
          error={nameError}
          autoCapitalize="words"
        />
        <TextField
          label="출생연도"
          value={birthYear}
          onChangeText={(value) => {
            setBirthYear(value);
            setBirthYearError(null);
            clearError();
          }}
          placeholder="1948"
          error={birthYearError}
          helperText="나이는 해마다 바뀌므로 태어난 해를 받습니다."
          keyboardType="number-pad"
        />
        <ChoiceGroup
          label="성별"
          options={GenderOptions}
          value={gender}
          onChange={(value) => {
            setGender(value);
            setGenderError(null);
          }}
          error={genderError}
        />
        <TextField
          label="보호자와의 관계 (선택)"
          value={relationship}
          onChangeText={setRelationship}
          placeholder="어머니"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.section}>
        <AppText variant="heading">건강 상태</AppText>
        <ChoiceGroup
          label="거동 상태"
          options={MobilityOptions}
          value={mobility}
          onChange={(value) => {
            setMobility(value);
            setMobilityError(null);
          }}
          error={mobilityError}
        />
        <ChoiceGroup
          label="인지 상태"
          options={CognitionOptions}
          value={cognition}
          onChange={setCognition}
        />
        <MultiChoiceGroup
          label="질환 (해당하는 것 모두)"
          options={CommonConditions}
          values={conditions}
          onChange={setConditions}
          helperText="여기서 고른 항목을 간병인의 경험과 맞춰 봅니다."
        />
        <TextField
          label="특이사항 (선택)"
          value={careNotes}
          onChangeText={setCareNotes}
          placeholder="식사는 죽으로 드시고, 오후에는 산책을 좋아하십니다."
          helperText="간병인이 미리 알아 두면 좋은 내용을 적어 주세요."
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
  section: {
    paddingTop: Spacing.sm,
    gap: Spacing.lg,
  },
});
