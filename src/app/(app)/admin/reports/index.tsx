import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminNoteForm, ReportQueueCard } from '@/components/admin';
import { AppButton, AppText, EmptyState, LoadingView, Screen } from '@/components/common';
import { useAdminStore } from '@/store/use-admin-store';
import { useAuthStore } from '@/store/use-auth-store';
import { Spacing } from '@/theme';
import { ReviewReportStatusLabels, type AdminReviewReport, type ReviewReportStatus } from '@/types';

const StatusTabs: ReviewReportStatus[] = ['open', 'accepted', 'dismissed'];

const EmptyMessages: Record<ReviewReportStatus, { title: string; description: string }> = {
  open: {
    title: '확인을 기다리는 신고가 없습니다',
    description: '보호자나 간병인이 후기를 신고하면 여기에 오래 기다린 순서로 쌓입니다.',
  },
  accepted: {
    title: '삭제한 후기가 없습니다',
    description: '신고를 확인하고 후기를 지우면 여기로 옮겨집니다. 잘못 지웠다면 여기서 복구합니다.',
  },
  dismissed: {
    title: '반려한 신고가 없습니다',
    description: '문제가 없다고 판단한 신고와, 복구한 후기에 달렸던 신고가 여기에 남습니다.',
  },
};

/** 펼쳐 둔 확인 폼. 한 번에 하나만 연다. */
type OpenForm = { kind: 'delete' | 'dismiss' | 'restore'; report: AdminReviewReport };

/**
 * 후기 신고 큐.
 *
 * 처리 상태별로 나눠 본다. 기본은 '확인 중'이고, 삭제한 후기를 되돌리는 일은
 * '후기 삭제됨' 탭에서만 한다 — 확인 중인 신고 사이에 복구 버튼이 섞이면 잘못 누르기 쉽다.
 */
export default function AdminReportsScreen() {
  const adminId = useAuthStore((state) => state.user?.id);

  const reports = useAdminStore((state) => state.reports);
  const reportStatus = useAdminStore((state) => state.reportStatus);
  const isLoading = useAdminStore((state) => state.isLoadingReports);
  const processingId = useAdminStore((state) => state.processingId);
  const errorMessage = useAdminStore((state) => state.errorMessage);
  const loadReports = useAdminStore((state) => state.loadReports);
  const deleteReview = useAdminStore((state) => state.deleteReview);
  const restoreReview = useAdminStore((state) => state.restoreReview);
  const dismissReport = useAdminStore((state) => state.dismissReport);

  const [status, setStatus] = useState<ReviewReportStatus>('open');
  const [openForm, setOpenForm] = useState<OpenForm | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadReports(status);
    }, [loadReports, status])
  );

  const handleConfirm = (form: OpenForm, note: string) => {
    if (!adminId) {
      return;
    }

    const run =
      form.kind === 'delete'
        ? deleteReview(form.report.reviewId, adminId, note)
        : form.kind === 'restore'
          ? restoreReview(form.report.reviewId, adminId, note)
          : dismissReport(form.report.reportId, adminId, note);

    // 실패해도 닫는다. 실패는 대개 다른 관리자가 먼저 처리했다는 뜻이고, 다시 불러온
    // 목록에서는 이 줄의 상태가 이미 바뀌어 있어 펼쳐 둔 폼이 더 이상 맞지 않는다.
    void run.then(() => setOpenForm(null));
  };

  const listed = reportStatus === status ? reports : [];

  return (
    <Screen scroll avoidKeyboard edges={['bottom']}>
      <View style={styles.tabs}>
        {StatusTabs.map((tab) => (
          <AppButton
            key={tab}
            title={ReviewReportStatusLabels[tab]}
            variant={tab === status ? 'primary' : 'outline'}
            style={styles.tab}
            disabled={processingId !== null}
            onPress={() => {
              setOpenForm(null);
              setStatus(tab);
            }}
          />
        ))}
      </View>

      {errorMessage ? (
        <AppText variant="body" tone="danger">
          {errorMessage}
        </AppText>
      ) : null}

      {isLoading && listed.length === 0 ? (
        <LoadingView message="신고를 불러오는 중입니다" />
      ) : listed.length === 0 ? (
        <EmptyState {...EmptyMessages[status]} />
      ) : (
        listed.map((report) => {
          const busy =
            processingId === report.reviewId || processingId === report.reportId;

          if (openForm?.report.reportId === report.reportId) {
            return (
              <ReportActionForm
                key={report.reportId}
                form={openForm}
                busy={busy}
                onDismiss={() => setOpenForm(null)}
                onConfirm={(note) => handleConfirm(openForm, note)}
              />
            );
          }

          return (
            <ReportQueueCard
              key={report.reportId}
              report={report}
              busy={busy}
              onDelete={() => setOpenForm({ kind: 'delete', report })}
              onDismiss={() => setOpenForm({ kind: 'dismiss', report })}
              onRestore={() => setOpenForm({ kind: 'restore', report })}
            />
          );
        })
      )}
    </Screen>
  );
}

type ReportActionFormProps = {
  form: OpenForm;
  busy: boolean;
  onConfirm: (note: string) => void;
  onDismiss: () => void;
};

/** 조치마다 무슨 일이 일어나는지를 누르기 전에 그대로 적어 둔다 */
function ReportActionForm({ form, busy, onConfirm, onDismiss }: ReportActionFormProps) {
  const { report } = form;

  if (form.kind === 'delete') {
    return (
      <AdminNoteForm
        title={`${report.reviewerName} 님의 후기를 삭제할까요?`}
        consequences={[
          `${report.revieweeName} 님의 후기 목록과 평균 별점에서 빠집니다`,
          report.reportCount > 1
            ? `이 후기에 달린 확인 중인 신고 ${report.reportCount}건이 함께 마감됩니다`
            : '신고가 받아들여진 것으로 마감됩니다',
          '작성자는 이 간병에 후기를 다시 쓸 수 없습니다',
          '잘못 지웠다면 나중에 복구할 수 있습니다',
        ]}
        noteLabel="삭제 사유"
        notePlaceholder="예: 욕설이 포함되어 있음"
        confirmTitle="후기 삭제"
        confirmVariant="danger"
        busy={busy}
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      />
    );
  }

  if (form.kind === 'restore') {
    return (
      <AdminNoteForm
        title="삭제한 후기를 복구할까요?"
        consequences={[
          `${report.revieweeName} 님의 후기 목록과 평균 별점에 다시 들어갑니다`,
          '삭제하면서 마감했던 신고는 반려로 바뀝니다',
        ]}
        noteLabel="복구 사유"
        notePlaceholder="예: 사실 확인 결과 허위가 아니었음"
        confirmTitle="후기 복구"
        busy={busy}
        onConfirm={onConfirm}
        onDismiss={onDismiss}
      />
    );
  }

  return (
    <AdminNoteForm
      title="이 신고를 반려할까요?"
      consequences={[
        '후기는 그대로 남습니다',
        '신고한 분에게는 반려로 보이고, 후기를 쓴 분에게는 알리지 않습니다',
        report.reportCount > 1
          ? `같은 후기의 다른 신고 ${report.reportCount - 1}건은 따로 처리해야 합니다`
          : '반려한 신고는 되돌릴 수 없습니다',
      ]}
      noteLabel="반려 사유"
      notePlaceholder="예: 부정적인 평가일 뿐 규정 위반은 아님"
      confirmTitle="신고 반려"
      busy={busy}
      onConfirm={onConfirm}
      onDismiss={onDismiss}
    />
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  tab: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
  },
});
