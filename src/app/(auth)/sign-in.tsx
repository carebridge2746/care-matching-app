import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { DemoAccounts, DemoPassword, isMockAuth } from '@/api/auth';
import { AppButton, AppText, Card, Screen, TextField } from '@/components/common';
import { validateEmail, validatePassword } from '@/lib/validation';
import { useAuthStore } from '@/store/use-auth-store';
import { Spacing } from '@/theme';
import { RoleLabels } from '@/types';

/**
 * 로그인 화면.
 *
 * 로그인에 성공하면 저장소의 user가 채워지고, 루트 레이아웃의 guard가 열리면서
 * 라우터가 알아서 유형별 화면으로 이동한다. 이 화면은 직접 이동시키지 않는다.
 */
export default function SignInScreen() {
  const router = useRouter();
  const signIn = useAuthStore((state) => state.signIn);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const errorMessage = useAuthStore((state) => state.errorMessage);
  const clearError = useAuthStore((state) => state.clearError);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const nextEmailError = validateEmail(email);
    const nextPasswordError = validatePassword(password);

    setEmailError(nextEmailError);
    setPasswordError(nextPasswordError);

    if (nextEmailError || nextPasswordError) {
      return;
    }

    await signIn({ email, password });
  };

  const fillDemoAccount = (demoEmail: string) => {
    clearError();
    setEmailError(null);
    setPasswordError(null);
    setEmail(demoEmail);
    setPassword(DemoPassword);
  };

  return (
    <Screen
      scroll
      avoidKeyboard
      edges={['bottom']}
      footer={
        <>
          <AppButton
            title="로그인"
            onPress={handleSubmit}
            loading={isSubmitting}
            disabled={isSubmitting}
          />
          <AppButton
            title="회원가입"
            variant="outline"
            onPress={() => router.push('/sign-up')}
            disabled={isSubmitting}
          />
        </>
      }>
      <View style={styles.intro}>
        <AppText variant="title">다시 오신 것을 환영합니다</AppText>
        <AppText variant="body" tone="secondary">
          가입할 때 사용한 이메일로 로그인해 주세요.
        </AppText>
      </View>

      <View style={styles.form}>
        <TextField
          label="이메일"
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            if (emailError) {
              setEmailError(null);
            }
            clearError();
          }}
          placeholder="name@example.com"
          error={emailError}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
        />
        <TextField
          label="비밀번호"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            if (passwordError) {
              setPasswordError(null);
            }
            clearError();
          }}
          placeholder="비밀번호를 입력하세요"
          error={passwordError}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />
      </View>

      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}

      {isMockAuth ? (
        <Card>
          <AppText variant="label">시연용 계정</AppText>
          <AppText variant="caption" tone="secondary">
            Supabase 연결 전까지는 아래 계정으로 각 유형의 화면을 확인할 수 있습니다. 비밀번호는
            모두 {DemoPassword} 입니다.
          </AppText>
          <View style={styles.demoButtons}>
            {DemoAccounts.map((account) => (
              <AppButton
                key={account.id}
                title={RoleLabels[account.role]}
                variant="secondary"
                style={styles.demoButton}
                onPress={() => fillDemoAccount(account.email)}
                disabled={isSubmitting}
              />
            ))}
          </View>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    paddingTop: Spacing.lg,
    gap: Spacing.sm,
  },
  form: {
    gap: Spacing.lg,
  },
  demoButtons: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingTop: Spacing.xs,
  },
  demoButton: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
  },
});
