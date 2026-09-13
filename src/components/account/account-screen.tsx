import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/components/common/app-button';
import { AppText } from '@/components/common/app-text';
import { Card } from '@/components/common/card';
import { Screen } from '@/components/common/screen';
import { useAuthStore } from '@/store/use-auth-store';
import { Spacing } from '@/theme';

/** 탈퇴하면 무엇이 지워지고 무엇이 남는지. 법률 문구가 아니라 실제로 일어나는 일을 적는다. */
const WithdrawalPoints = {
  guardian: [
    '이름·연락처·이메일을 지웁니다.',
    '간병 기록이 없는 환자와 요청은 함께 지웁니다.',
    '간병 기록이 있는 환자는 이름과 건강 정보를, 요청은 적어 둔 원문을 지웁니다.',
    "매칭·후기·노쇼 기록은 '탈퇴한 사용자'로 남습니다. 간병인이 받은 평가가 함께 사라지지 않게 하기 위해서입니다.",
  ],
  caregiver: [
    '이름·연락처·이메일과 자기소개를 지우고, 보호자의 추천 목록에 더는 나오지 않습니다.',
    "매칭·후기·노쇼 기록과 교육 수료 기록은 '탈퇴한 사용자'로 남습니다. 보호자가 남긴 평가가 함께 사라지지 않게 하기 위해서입니다.",
  ],
} as const;

/**
 * 계정 — 내 정보와 탈퇴. 보호자와 간병인이 같은 화면을 쓴다.
 *
 * 탈퇴는 되돌릴 수 없어서 한 번 더 묻는다. 예정되었거나 진행 중인 간병이 있으면 저장소가
 * 거절하고, 그 이유를 이 화면에 그대로 보여 준다.
 */
export function AccountScreen() {
  const user = useAuthStore((state) => state.user);
  const withdraw = useAuthStore((state) => state.withdraw);
  const isSubmitting = useAuthStore((state) => state.isSubmitting);
  const errorMessage = useAuthStore((state) => state.errorMessage);
  const clearError = useAuthStore((state) => state.clearError);

  const [isConfirming, setConfirming] = useState(false);

  // 로그인 화면에서 남은 오류 문구가 여기서 보이지 않게 들어올 때 비우고, 떠날 때도 비운다
  useEffect(() => {
    clearError();
    return clearError;
  }, [clearError]);

  if (!user || user.role === 'admin') {
    return null;
  }

  return (
    <Screen scroll edges={['bottom']}>
      <Card>
        <AppText variant="subheading">내 정보</AppText>
        <AppText variant="body">{user.name}</AppText>
        <AppText variant="caption" tone="secondary">
          {user.email}
          {user.phone ? ` · ${user.phone}` : ''}
        </AppText>
      </Card>

      <Card>
        <AppText variant="subheading">탈퇴</AppText>
        <AppText variant="body" tone="secondary">
          {WithdrawalPoints[user.role].map((point) => `· ${point}`).join('\n')}
        </AppText>
        <AppText variant="caption" tone="secondary">
          예정되었거나 진행 중인 간병이 있으면 탈퇴할 수 없습니다. 탈퇴는 되돌릴 수 없고, 같은 이메일로 다시
          가입해도 이전 기록은 이어지지 않습니다.
        </AppText>

        {errorMessage ? (
          <AppText variant="body" tone="danger">
            {errorMessage}
          </AppText>
        ) : null}

        {isConfirming ? (
          <View style={styles.confirm}>
            <AppText variant="body">정말 탈퇴할까요?</AppText>
            <View style={styles.actions}>
              <AppButton
                title="네, 탈퇴합니다"
                variant="danger"
                style={styles.action}
                loading={isSubmitting}
                disabled={isSubmitting}
                onPress={() => {
                  void withdraw().then((succeeded) => {
                    // 성공하면 로그인 화면으로 넘어가므로 거절됐을 때만 확인을 접는다
                    if (!succeeded) {
                      setConfirming(false);
                    }
                  });
                }}
              />
              <AppButton
                title="아니요"
                variant="outline"
                style={styles.action}
                disabled={isSubmitting}
                onPress={() => setConfirming(false)}
              />
            </View>
          </View>
        ) : (
          <AppButton
            title="탈퇴하기"
            variant="outline"
            onPress={() => {
              clearError();
              setConfirming(true);
            }}
          />
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  confirm: {
    gap: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  action: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
});
