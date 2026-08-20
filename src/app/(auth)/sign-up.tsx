import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RoleOption } from '@/components/auth/role-option';
import { AppButton, AppText, Screen, TextField } from '@/components/common';
import {
  MinPasswordLength,
  validateEmail,
  validateName,
  validatePassword,
  validatePasswordConfirm,
  validatePhone,
} from '@/lib/validation';
import { useAuthStore } from '@/store/use-auth-store';
import { Spacing } from '@/theme';
import type { UserRole } from '@/types';

/**
 * 회원가입 화면.
 *
 * 가입할 수 있는 유형은 보호자와 간병인 둘 뿐이다.
 * 관리자 계정은 화면에서 만들지 않고 운영자가 직접 발급한다.
 */
const SignUpRoles = ['guardian', 'caregiver'] as const satisfies readonly UserRole[];

const RoleDescriptions: Record<(typeof SignUpRoles)[number], string> = {
  guardian: '가족의 간병을 요청하고 추천받은 간병인을 확인합니다.',
  caregiver: '역량과 가능한 시간을 등록하고 간병 요청을 수락합니다.',
};

type FormField = 'name' | 'email' | 'password' | 'passwordConfirm' | 'phone';

const EmptyForm: Record<FormField, string> = {
  name: '',
  email: '',
  password: '',
  passwordConfirm: '',
  phone: '',
};

export default function SignUpScreen() {
  const signUp = useAuthStore((state) => state.signUp);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const errorMessage = useAuthStore((state) => state.errorMessage);
  const clearError = useAuthStore((state) => state.clearError);

  const [role, setRole] = useState<UserRole | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [values, setValues] = useState(EmptyForm);
  const [errors, setErrors] = useState<Partial<Record<FormField, string | null>>>({});

  const updateField = (field: FormField) => (value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: null }));
    clearError();
  };

  const selectRole = (nextRole: UserRole) => {
    setRole(nextRole);
    setRoleError(null);
    clearError();
  };

  const handleSubmit = async () => {
    const nextRoleError = role ? null : '이용 유형을 선택해 주세요.';
    const nextErrors: Record<FormField, string | null> = {
      name: validateName(values.name),
      email: validateEmail(values.email),
      password: validatePassword(values.password),
      passwordConfirm: validatePasswordConfirm(values.password, values.passwordConfirm),
      phone: validatePhone(values.phone),
    };

    setRoleError(nextRoleError);
    setErrors(nextErrors);

    if (nextRoleError || !role || Object.values(nextErrors).some((error) => error !== null)) {
      return;
    }

    // 가입에 성공하면 곧바로 로그인 상태가 되고, 라우터가 유형별 화면으로 이동시킨다.
    await signUp({
      email: values.email,
      password: values.password,
      name: values.name,
      role,
      phone: values.phone.trim() || undefined,
    });
  };

  return (
    <Screen
      scroll
      avoidKeyboard
      edges={['bottom']}
      footer={
        <AppButton
          title="가입하고 시작하기"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting}
        />
      }>
      <View style={styles.section}>
        <AppText variant="heading">이용 유형</AppText>
        <AppText variant="caption" tone="secondary">
          선택한 유형에 따라 보이는 화면이 달라집니다. 가입 후에는 바꿀 수 없습니다.
        </AppText>
        {SignUpRoles.map((option) => (
          <RoleOption
            key={option}
            role={option}
            description={RoleDescriptions[option]}
            selected={role === option}
            onSelect={selectRole}
          />
        ))}
        {roleError ? (
          <AppText variant="caption" tone="danger">
            {roleError}
          </AppText>
        ) : null}
      </View>

      <View style={styles.section}>
        <AppText variant="heading">기본 정보</AppText>
        <TextField
          label="이름"
          value={values.name}
          onChangeText={updateField('name')}
          placeholder="홍길동"
          error={errors.name}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
        />
        <TextField
          label="이메일"
          value={values.email}
          onChangeText={updateField('email')}
          placeholder="name@example.com"
          error={errors.email}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <TextField
          label="비밀번호"
          value={values.password}
          onChangeText={updateField('password')}
          placeholder="비밀번호를 입력하세요"
          error={errors.password}
          helperText={`${MinPasswordLength}자 이상 입력해 주세요.`}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <TextField
          label="비밀번호 확인"
          value={values.passwordConfirm}
          onChangeText={updateField('passwordConfirm')}
          placeholder="비밀번호를 한 번 더 입력하세요"
          error={errors.passwordConfirm}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
        />
        <TextField
          label="연락처 (선택)"
          value={values.phone}
          onChangeText={updateField('phone')}
          placeholder="010-1234-5678"
          error={errors.phone}
          helperText="매칭된 뒤 상대방에게 공개됩니다."
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />
      </View>

      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}

      <AppText variant="caption" tone="tertiary">
        관리자 계정은 회원가입으로 만들 수 없으며 운영자가 직접 발급합니다.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingTop: Spacing.sm,
    gap: Spacing.md,
  },
});
