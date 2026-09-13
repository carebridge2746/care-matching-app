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
import { describeAiFill, fillDraftFromAi } from '@/lib/ai-fill';
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
  type AiCareConditions,
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

/** AI 가 정리한 원문과 그 결과. 원문이 그 뒤로 바뀌면 등록할 때 다시 정리한다. */
type Structured = {
  text: string;
  conditions: AiCareConditions;
};

/**
 * 간병 요청 작성.
 *
 * 자연어 원문과 조건을 함께 받는다. 원문을 적고 버튼을 누르면 AI 가 읽어 낸 조건으로
 * 비어 있는 칸을 채운다 — 원문에 "서울 강남구, 오전 9시부터"라고 적은 보호자가 같은 내용을
 * 아래 칸에 한 번 더 적지 않게 하려는 것이다. 이미 고른 값은 덮어쓰지 않는다.
 *
 * 채운 뒤에도 사람이 고친 값이 기준이다. 매칭은 이 폼의 조건으로 한다.
 */
export default function CareRequestNewScreen() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  const patients = usePatientsStore((state) => state.patients);
  const loadPatients = usePatientsStore((state) => state.load);

  const create = useCareRequestsStore((state) => state.create);
  const structure = useCareRequestsStore((state) => state.structure);
  const isSubmitting = useCareRequestsStore((state) => state.isSubmitting);
  const isStructuring = useCareRequestsStore((state) => state.isStructuring);
  const errorMessage = useCareRequestsStore((state) => state.errorMessage);
  const clearError = useCareRequestsStore((state) => state.clearError);

  const [patientId, setPatientId] = useState<string | null>(null);
  const [requestText, setRequestText] = useState('');
  const [careType, setCareType] = useState<CareType | null>(null);
  const [region, setRegion] = useState('');
  const [startDate, setStartDate] = useState(today());
  /** 시작일은 오늘로 미리 채워 두므로, 보호자가 직접 고쳤는지를 따로 기억한다 */
  const [startDateTouched, setStartDateTouched] = useState(false);
  const [endDate, setEndDate] = useState('');
  const [dailyStartTime, setDailyStartTime] = useState('');
  const [dailyEndTime, setDailyEndTime] = useState('');
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [preferredGender, setPreferredGender] = useState<CaregiverGenderPreference>('any');
  const [budget, setBudget] = useState('');

  const [structured, setStructured] = useState<Structured | null>(null);
  const [aiNotice, setAiNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const guardianId = user?.id;

  // 환자가 한 명뿐이면 고를 필요가 없다. 여럿이면 잘못 고르지 않도록 비워 둔다.
  const selectedPatientId = patientId ?? (patients.length === 1 ? (patients[0]?.id ?? null) : null);
  const hasErrors = Object.values(errors).some((error) => error !== null);

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

  const handleFill = async () => {
    const textError = validateRequestText(requestText);
    if (textError) {
      setErrors((previous) => ({ ...previous, requestText: textError }));
      return;
    }

    setAiNotice(null);
    const conditions = await structure(requestText);

    if (!conditions) {
      setAiNotice('원문을 정리하지 못했습니다. 아래 조건을 직접 채워 주세요.');
      return;
    }

    const { draft, filledLabels } = fillDraftFromAi(
      {
        careType,
        region,
        startDate,
        endDate,
        dailyStartTime,
        dailyEndTime,
        requiredSkills,
        preferredGender,
        budget,
      },
      conditions,
      { startDateTouched }
    );

    setCareType(draft.careType);
    setRegion(draft.region);
    setStartDate(draft.startDate);
    setEndDate(draft.endDate);
    setDailyStartTime(draft.dailyStartTime);
    setDailyEndTime(draft.dailyEndTime);
    setRequiredSkills(draft.requiredSkills);
    setPreferredGender(draft.preferredGender);
    setBudget(draft.budget);

    // 채운 칸의 오류는 지운다. 채운 값이 틀렸다면 등록할 때 다시 걸린다.
    setErrors((previous) => ({
      ...previous,
      careType: null,
      region: null,
      startDate: null,
      endDate: null,
      dailyStartTime: null,
      dailyEndTime: null,
      budget: null,
    }));
    setStructured({ text: requestText, conditions });
    setAiNotice(describeAiFill(filledLabels));
  };

  const handleSubmit = async () => {
    if (!user) {
      return;
    }

    const nextErrors: Record<string, string | null> = {
      patient: selectedPatientId ? null : '어느 분의 간병인지 선택해 주세요.',
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

    if (
      !selectedPatientId ||
      !careType ||
      Object.values(nextErrors).some((error) => error !== null)
    ) {
      return;
    }

    const budgetValue = budget.trim() ? Number(budget.trim().replace(/,/g, '')) : undefined;

    const request = await create(user.id, {
      patientId: selectedPatientId,
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
      // 같은 원문을 이미 정리했다면 그 결과를 쓴다. 정리한 뒤 원문을 고쳤다면 저장소가 다시 정리한다.
      ...(structured && structured.text === requestText
        ? { aiConditions: structured.conditions }
        : {}),
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
        <>
          {/* 오류는 각 칸 아래에 뜨는데, 긴 폼 끝에서 등록을 누르면 화면 밖이라 보이지 않는다 */}
          {hasErrors ? (
            <AppText variant="caption" tone="danger" center>
              입력이 필요한 항목이 있습니다. 위로 올려 빨간 표시를 확인해 주세요.
            </AppText>
          ) : null}
          <AppButton
            // 정리에 몇 초가 걸리므로 무엇을 기다리는지 버튼이 그대로 말해 준다
            title={isSubmitting && isStructuring ? '요청 내용을 정리하는 중' : '요청 등록'}
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting || isStructuring}
          />
        </>
      }>
      <View style={styles.section}>
        <ChoiceGroup
          label="어느 분의 간병인가요"
          options={patientOptions}
          value={selectedPatientId}
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
          helperText="평소 말하듯 적어 주세요. 이 글은 요청을 수락한 간병인에게만 보입니다. 아래 버튼을 누르면 AI가 비어 있는 조건을 채워 드립니다."
          multiline
        />
        <AppButton
          title={isStructuring && !isSubmitting ? '적은 내용을 정리하는 중' : '적은 내용으로 아래 조건 채우기'}
          variant="secondary"
          loading={isStructuring && !isSubmitting}
          disabled={isStructuring || isSubmitting}
          onPress={() => {
            void handleFill();
          }}
        />
        {aiNotice ? (
          <AppText variant="caption" tone="secondary">
            {aiNotice}
          </AppText>
        ) : null}
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
            setStartDateTouched(true);
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
