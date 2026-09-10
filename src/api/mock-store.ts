import { readJson, writeJson } from '@/lib/storage';
import type {
  AdminAction,
  CareRequest,
  CaregiverProfile,
  Match,
  Patient,
  QuizAttempt,
  Review,
  ReviewReport,
  TrainingCompletion,
} from '@/types';

/**
 * Mock 모드의 로컬 저장소.
 *
 * 환자와 간병 요청은 서로를 필요로 한다 — 환자를 지우면 그 환자의 요청도 사라지고,
 * 간병인 화면은 요청에 환자 요약을 붙여서 보여 준다.
 * 두 어댑터가 서로를 import 하면 순환 참조가 되므로, 저장소 접근만 이 파일에 모아 둔다.
 *
 * Supabase 모드에서는 같은 자리를 데이터베이스가 맡는다.
 * 여기서는 사용자별로 파일을 나누지 않고 한 저장소에 모두 담는데,
 * 그래야 보호자가 올린 요청을 간병인 계정으로 로그인해서 그대로 볼 수 있다.
 */

const PatientsKey = 'careapp.mock.patients';
const CareRequestsKey = 'careapp.mock.care-requests';
const CaregiverProfilesKey = 'careapp.mock.caregiver-profiles';
const MatchesKey = 'careapp.mock.matches';
const ReviewsKey = 'careapp.mock.reviews';
const ReviewReportsKey = 'careapp.mock.review-reports';
const AdminActionsKey = 'careapp.mock.admin-actions';
const QuizAttemptsKey = 'careapp.mock.quiz-attempts';
const TrainingCompletionsKey = 'careapp.mock.training-completions';

/** 어댑터가 흉내 내는 네트워크 지연. 화면의 로딩 표시까지 확인하기 위한 값이다. */
export const NetworkDelayMs = 300;

export function delay(ms: number = NetworkDelayMs): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadPatients(): Promise<Patient[]> {
  return (await readJson<Patient[]>(PatientsKey)) ?? [];
}

export async function savePatients(patients: Patient[]): Promise<void> {
  await writeJson(PatientsKey, patients);
}

export async function loadCareRequests(): Promise<CareRequest[]> {
  return (await readJson<CareRequest[]>(CareRequestsKey)) ?? [];
}

export async function saveCareRequests(requests: CareRequest[]): Promise<void> {
  await writeJson(CareRequestsKey, requests);
}

/**
 * 매칭 이력.
 *
 * 요청·환자·사람을 함께 담지 않고 식별자만 들고 있는다.
 * 화면에 필요한 나머지는 읽을 때 이어 붙인다 — Supabase 쪽에서는 match_details 뷰의
 * 조인이 같은 일을 하고, 여기서 복사본을 들고 있으면 원본이 바뀔 때 둘이 어긋난다.
 */
export async function loadMatches(): Promise<Match[]> {
  return (await readJson<Match[]>(MatchesKey)) ?? [];
}

export async function saveMatches(matches: Match[]): Promise<void> {
  await writeJson(MatchesKey, matches);
}

/**
 * 후기.
 *
 * 평균 별점은 함께 저장하지 않는다. 읽을 때 세면 언제나 맞고,
 * 저장해 두면 후기가 늘어날 때마다 두 값을 함께 고쳐야 한다 — Supabase 쪽도 뷰로 센다.
 */
export async function loadReviews(): Promise<Review[]> {
  return (await readJson<Review[]>(ReviewsKey)) ?? [];
}

export async function saveReviews(reviews: Review[]): Promise<void> {
  await writeJson(ReviewsKey, reviews);
}

/**
 * 후기 신고.
 *
 * 도메인 타입(ReviewReport)에는 누가 신고했는지가 없다. 앱에서는 언제나 내 신고만
 * 보기 때문이고, Supabase 쪽에서는 "본인 신고 조회" 정책이 그 일을 대신한다.
 * 여기서는 모든 사용자가 한 저장소를 나눠 쓰므로 저장할 때만 주인을 함께 적어 둔다 —
 * 퀴즈 응시·수료와 같은 방식이다.
 */
export type StoredReviewReport = ReviewReport & { reporterId: string };

export async function loadReviewReports(): Promise<StoredReviewReport[]> {
  return (await readJson<StoredReviewReport[]>(ReviewReportsKey)) ?? [];
}

export async function saveReviewReports(reports: StoredReviewReport[]): Promise<void> {
  await writeJson(ReviewReportsKey, reports);
}

/**
 * 관리자가 한 조치의 기록.
 *
 * Mock 모드에도 남긴다. 관리자 화면이 이 목록을 그대로 보여 주기 때문이고,
 * 무엇보다 노쇼 신고를 되돌리면 노쇼였다는 사실이 매칭에서 사라지는 것은
 * Supabase 쪽과 똑같아서, 로그가 없으면 두 모드가 다른 답을 낸다.
 */
export async function loadAdminActions(): Promise<AdminAction[]> {
  return (await readJson<AdminAction[]>(AdminActionsKey)) ?? [];
}

export async function saveAdminActions(actions: AdminAction[]): Promise<void> {
  await writeJson(AdminActionsKey, actions);
}

/**
 * 퀴즈 응시와 수료.
 *
 * 도메인 타입(QuizAttempt · TrainingCompletion)에는 "누구의 것인지"가 없다.
 * 앱에서는 언제나 내 것만 보기 때문이고, Supabase 쪽에서는 정책이 그 일을 대신한다.
 * 여기서는 모든 사용자가 한 저장소를 나눠 쓰므로 저장할 때만 주인을 함께 적어 둔다.
 */
export type StoredQuizAttempt = QuizAttempt & { caregiverId: string };
export type StoredTrainingCompletion = TrainingCompletion & { caregiverId: string };

export async function loadQuizAttempts(): Promise<StoredQuizAttempt[]> {
  return (await readJson<StoredQuizAttempt[]>(QuizAttemptsKey)) ?? [];
}

export async function saveQuizAttempts(attempts: StoredQuizAttempt[]): Promise<void> {
  await writeJson(QuizAttemptsKey, attempts);
}

/** 수료는 과정당 한 줄만 남는다. 다시 합격해도 줄이 늘지 않고 날짜도 그대로다. */
export async function loadTrainingCompletions(): Promise<StoredTrainingCompletion[]> {
  return (await readJson<StoredTrainingCompletion[]>(TrainingCompletionsKey)) ?? [];
}

export async function saveTrainingCompletions(
  completions: StoredTrainingCompletion[]
): Promise<void> {
  await writeJson(TrainingCompletionsKey, completions);
}

export async function loadCaregiverProfiles(): Promise<CaregiverProfile[]> {
  return (await readJson<CaregiverProfile[]>(CaregiverProfilesKey)) ?? [];
}

export async function saveCaregiverProfiles(profiles: CaregiverProfile[]): Promise<void> {
  await writeJson(CaregiverProfilesKey, profiles);
}
