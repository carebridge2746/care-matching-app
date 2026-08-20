import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  ChoiceGroup,
  DateField,
  EmptyState,
  MultiChoiceGroup,
  Screen,
  TextField,
  type ChoiceOption,
} from '@/components/common';
import { CommonCareSkills } from '@/lib/care-options';
import { today } from '@/lib/date';
import {
  validateBudget,
  validateDate,
  validateEndDate,
  validateRequestText,
  validateRequired,
  validateTime,
} from '@/lib/validation';
import { useAuthStore } from '@/store/use-auth-store';
import { useCareRequestsStore } from '@/store/use-care-requests-store';
import { usePatientsStore } from '@/store/use-patients-store';
import { Spacing } from '@/theme';
import {
  ageFromBirthYear,
  CareTypeLabels,
  CaregiverGenderPreferenceLabels,
  type CaregiverGenderPreference,
  type CareType,
} from '@/types';

const CareTypeOptions: ChoiceOption<CareType>[] = [
  { value: 'hospital', label: CareTypeLabels.hospital, description: '입원 중인 병원에서 돌봄' },
  { value: 'home', label: CareTypeLabels.home, description: '집으로 방문해서 돌봄' },
  { value: 'facility', label: CareTypeLabels.facility, description: '요양시설에서 돌봄' },
];

const GenderPreferenceOptions: ChoiceOption<CaregiverGenderPreference>[] = [
  { value: 'any', label: CaregiverGenderPreferenceLabels.any },
  { value: 'female', label: CaregiverGenderPreferenceLabels.female },
  { value: 'male', label: CaregiverGenderPreferenceLabels.male },
];

/**
 * 간병 요청 작성.
 *
 * 자연어 원문과 조건을 함께 받는다.
 * 원문은 Phase 4에서 AI가 조건으로 바꾸는 입력이 되고,
 * 지금 고른 조건은 사람이 직접 정한 값으로 그대로 남는다.
 */
export default function CareRequestNewScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const patients = usePatientsStore((state) => state.patients);
  const loadPatients = usePatientsStore((state) => state.load);

  const create = useCareRequestsStore((state) => state.create);
  const isSubmitting = useCareRequestsStore((state) => state.isSubmitting);
  const errorMessage = useCareRequestsStore((state) => state.errorMessage);
  const clearError = useCareRequestsStore((state) => state.clearError);

  const [patientId, setPatientId] = useState<string | null>(null);
  const [requestText, setRequestText] = useState('');
  const [careType, setCareType] = useState<CareType | null>(null);
  const [region, setRegion] = useState('');
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState('');
  const [dailyStartTime, setDailyStartTime] = useState('');
  const [dailyEndTime, setDailyEndTime] = useState('');
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [preferredGender, setPreferredGender] = useState<CaregiverGenderPreference>('any');
  const [budget, setBudget] = useState('');

  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const guardianId = user?.id;

  useEffect(() => {
    if (guardianId) {
      void loadPatients(guardianId);
    }
  }, [guardianId, loadPatients]);

  const patientOptions: ChoiceOption<string>[] = patients.map((patient) => ({
    value: patient.id,
    label: patient.name,
    description: `${ageFromBirthYear(patient.birthYear)}세${patient.relationship ? ` · ${patient.relationship}` : ''}`,
  }));

  const handleSubmit = async () => {
    if (!user) {
      return;
    }

    const nextErrors: Record<string, string | null> = {
      patient: patientId ? null : '어느 분의 간병인지 선택해 주세요.',
      requestText: validateRequestText(requestText),
      careType: careType ? null : '간병 장소를 선택해 주세요.',
      region: validateRequired(region, '지역'),
      startDate: validateDate(startDate, '시작일'),
      endDate: validateEndDate(startDate, endDate),
      dailyStartTime: validateTime(dailyStartTime, '시작 시각'),
      dailyEndTime: validateTime(dailyEndTime, '종료 시각'),
      budget: validateBudget(budget),
    };

    setErrors(nextErrors);

    if (!patientId || !careType || Object.values(nextErrors).some((error) => error !== null)) {
      return;
    }

    const budgetValue = budget.trim() ? Number(budget.trim().replace(/,/g, '')) : undefined;

    const request = await create(user.id, {
      patientId,
      requestText,
      careType,
      region,
      startDate,
      endDate: endDate.trim() || undefined,
      dailyStartTime: dailyStartTime.trim() || undefined,
      dailyEndTime: dailyEndTime.trim() || undefined,
      requiredSkills,
      preferredCaregiverGender: preferredGender,
      budgetPerDay: budgetValue,
    });

    if (request) {
      // 작성한 요청이 목록 맨 위에 보이도록 목록 화면으로 바꿔 준다
      router.replace('/guardian/requests');
    }
  };

  if (patients.length === 0) {
    return (
      <Screen scroll edges={['bottom']}>
        <EmptyState
          title="등록한 환자가 없습니다"
          description="간병 요청은 등록된 환자를 기준으로 작성합니다. 먼저 환자 정보를 등록해 주세요."
          actionTitle="환자 등록"
          onAction={() => router.replace('/guardian/patients/new')}
        />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      avoidKeyboard
      edges={['bottom']}
      footer={
        <AppButton
          title="요청 등록"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
        />
      }>
      <View style={styles.section}>
        <ChoiceGroup
          label="어느 분의 간병인가요"
          options={patientOptions}
          value={patientId}
          onChange={(value) => {
            setPatientId(value);
            setErrors((previous) => ({ ...previous, patient: null }));
          }}
          error={errors.patient}
        />
      </View>

      <View style={styles.section}>
        <AppText variant="heading">어떤 간병이 필요하신가요</AppText>
        <TextField
          label="요청 내용"
          value={requestText}
          onChangeText={(value) => {
            setRequestText(value);
            setErrors((previous) => ({ ...previous, requestText: null }));
            clearError();
          }}
          placeholder="어머니가 고관절 수술을 받으셔서 3주 정도 병원에서 도와주실 분이 필요합니다. 혼자 일어나기 어려우시고 식사 보조가 필요합니다."
          error={errors.requestText}
          helperText="평소 말하듯 적어 주세요. AI가 조건을 정리해 드립니다."
          multiline
        />
      </View>

      <View style={styles.section}>
        <AppText variant="heading">간병 조건</AppText>
        <ChoiceGroup
          label="간병 장소"
          options={CareTypeOptions}
          value={careType}
          onChange={(value) => {
            setCareType(value);
            setErrors((previous) => ({ ...previous, careType: null }));
          }}
          error={errors.careType}
        />
        <TextField
          label="지역"
          value={region}
          onChangeText={(value) => {
            setRegion(value);
            setErrors((previous) => ({ ...previous, region: null }));
          }}
          placeholder="서울 강남구"
          error={errors.region}
          helperText="가까운 지역의 간병인을 우선 찾습니다."
        />
        <DateField
          label="시작일"
          value={startDate}
          onChange={(value) => {
            setStartDate(value);
            setErrors((previous) => ({ ...previous, startDate: null }));
          }}
          error={errors.startDate}
        />
        <DateField
          label="종료일 (선택)"
          value={endDate}
          onChange={(value) => {
            setEndDate(value);
            setErrors((previous) => ({ ...previous, endDate: null }));
          }}
          error={errors.endDate}
          helperText="아직 모르면 비워 두세요."
          clearable
        />
        <View style={styles.timeRow}>
          <TextField
            label="시작 시각 (선택)"
            value={dailyStartTime}
            onChangeText={(value) => {
              setDailyStartTime(value);
              setErrors((previous) => ({ ...previous, dailyStartTime: null }));
            }}
            placeholder="09:00"
            error={errors.dailyStartTime}
          />
          <TextField
            label="종료 시각 (선택)"
            value={dailyEndTime}
            onChangeText={(value) => {
              setDailyEndTime(value);
              setErrors((previous) => ({ ...previous, dailyEndTime: null }));
            }}
            placeholder="18:00"
            error={errors.dailyEndTime}
          />
        </View>
        <MultiChoiceGroup
          label="필요한 간병 역량 (해당하는 것 모두)"
          options={CommonCareSkills}
          values={requiredSkills}
          onChange={setRequiredSkills}
          helperText="고른 항목을 할 수 있는 간병인을 우선 추천합니다."
        />
        <ChoiceGroup
          label="간병인 성별"
          options={GenderPreferenceOptions}
          value={preferredGender}
          onChange={setPreferredGender}
        />
        <TextField
          label="일당 예산 (선택)"
          value={budget}
          onChangeText={(value) => {
            setBudget(value);
            setErrors((previous) => ({ ...previous, budget: null }));
          }}
          placeholder="120000"
          error={errors.budget}
          helperText="하루 기준 금액(원)을 적어 주세요."
          keyboardType="number-pad"
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
  timeRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
});
