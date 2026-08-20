# AI 간병 매칭 플랫폼 (MVP)

보호자가 자연어로 간병 요청을 작성하면, AI가 요청을 구조화된 조건으로 변환하고
점수 기반 매칭 알고리즘이 적합한 간병인을 추천하는 모바일 앱 MVP입니다.

대학 프로젝트 및 프로토타입 시연용이며, 상용 서비스가 아닙니다.

## 핵심 흐름

```
보호자: 간병 요청(자연어) → AI 분석/구조화 → 점수 기반 매칭 → 간병인 추천 → 매칭 → 간병 → 상호 평가
간병인: 프로필/역량/자격/가능 시간 등록 → 요청 수락 → 간병 → 평가 확인
관리자: 사용자·요청·매칭·노쇼·교육·평가 관리
```

AI는 사람을 직접 고르지 않습니다. AI는 **자연어를 조건으로 변환**하는 역할만 하고,
간병인 선정은 **결정론적인 점수 계산**으로 이뤄집니다.

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 앱 | Expo SDK 57, React Native 0.86, TypeScript (strict) |
| 라우팅 | expo-router (파일 기반, 라우트 루트는 `src/app`) |
| 상태 관리 | Zustand |
| 백엔드 | Supabase (PostgreSQL, Auth, Edge Functions) |
| AI | LLM API — Supabase Edge Function 경유 호출 |

## 실행 방법

```bash
npm install
cp .env.example .env    # 값 입력
npx expo start
```

## 환경 변수

`.env.example`을 `.env`로 복사해서 사용합니다.

| 키 | 설명 |
| --- | --- |
| `EXPO_PUBLIC_AUTH_MODE` | `mock`이면 로컬 AsyncStorage 기반 Mock 인증, `supabase`면 Supabase Auth 사용 |
| `EXPO_PUBLIC_LLM_MODE` | `mock`이면 실제 LLM을 호출하지 않고 테스트 결과를 반환, `live`면 Edge Function 경유 호출 |
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase 공개 키 (`sb_publishable_...`). 접근 제어는 RLS로 수행 |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | 예전 프로젝트용 anon key. publishable key가 있으면 그쪽이 우선 |

LLM API Key와 Supabase `service_role` key는 클라이언트에 두지 않고
Supabase Edge Function의 secret으로만 설정합니다.

## 폴더 구조

```
src/
├── api/          # 백엔드 어댑터 (auth.ts = 진입점, auth.mock.ts / auth.supabase.ts = 구현)
├── app/          # expo-router 라우트 (화면)
│   ├── index.tsx     # 진입 화면 — 로그인 상태면 유형별 홈으로 보낸다
│   ├── (auth)/       # 비로그인 전용 — 로그인 / 회원가입
│   └── (app)/        # 로그인 전용 — guardian / caregiver / admin
├── components/
│   ├── auth/     # 회원가입 유형 선택 카드
│   ├── common/   # 화면 전반에서 재사용하는 UI (AppText, AppButton, Card, Screen, TextField 등)
│   └── home/     # 유형별 홈 화면의 공통 골격
├── lib/          # 라우트 매핑, 입력 검증, 저장소 헬퍼, 공통 헤더 옵션
├── store/        # Zustand 상태 저장소
├── theme/        # 디자인 토큰 (색상, 타이포, 여백, 상태 색상)
└── types/        # 도메인 타입
```

`supabase/schema.sql`에 데이터베이스 스키마(테이블·RLS 정책·트리거)를 둡니다.

## 디자인 원칙

- 고령자와 보호자가 함께 쓰므로 본문 글자는 18px 기준, 보조 문구도 15px 미만을 쓰지 않습니다.
- 주요 버튼의 터치 높이는 최소 56px입니다.
- 상태는 색상만으로 구분하지 않고 항상 텍스트 라벨을 함께 표시합니다 (`StatusBadge`).
- 색상·글자 크기·여백은 `src/theme/tokens.ts`에서만 정의하고, 화면에서 직접 값을 쓰지 않습니다.
- MVP는 라이트 테마만 지원합니다 (`app.json`의 `userInterfaceStyle: "light"`).

## 인증과 화면 분기

로그인 여부와 사용자 유형에 따라 접근할 수 있는 화면이 나뉩니다.

| 경로 | 접근 조건 | 설명 |
| --- | --- | --- |
| `/` | 누구나 | 서비스 소개. 로그인 상태면 유형별 홈으로 자동 이동 |
| `/sign-in`, `/sign-up` | 비로그인 | 로그인 / 회원가입 |
| `/guardian` | 보호자 | 보호자 홈 |
| `/caregiver` | 간병인 | 간병인 홈 |
| `/admin` | 관리자 | 관리자 홈 |

접근 제어는 `expo-router`의 `Stack.Protected` guard로만 처리합니다.
화면에서 `router.replace`로 이동을 강제하지 않으므로, 웹 주소를 직접 입력하거나
딥링크로 들어와도 같은 규칙이 적용됩니다. 유형 분기는 `src/lib/routes.ts` 한 곳에서만 정의합니다.

관리자 계정은 회원가입 화면에서 만들 수 없고 운영자가 직접 발급합니다.

### Mock 인증 (Supabase 연결 전)

Supabase 프로젝트가 준비되기 전까지는 `EXPO_PUBLIC_AUTH_MODE=mock` 으로 두고
로컬 저장소(AsyncStorage) 기반 Mock 인증을 사용합니다. 앱을 껐다 켜도 로그인 상태가 유지됩니다.

첫 실행 시 아래 시연용 계정이 자동으로 만들어집니다. 비밀번호는 모두 `care1234` 입니다.

| 이메일 | 유형 |
| --- | --- |
| `guardian@care.test` | 보호자 |
| `caregiver@care.test` | 간병인 |
| `admin@care.test` | 관리자 |

화면과 상태 저장소는 `src/api/auth.ts`의 `authApi`만 호출합니다.
어떤 구현이 연결되는지는 `EXPO_PUBLIC_AUTH_MODE` 하나로 정해지므로,
Mock ↔ Supabase 전환에 화면 코드는 바뀌지 않습니다.

### Supabase 인증으로 전환하기

1. [supabase.com](https://supabase.com)에서 프로젝트를 만듭니다.
2. 대시보드의 **SQL Editor**에서 `supabase/schema.sql`을 실행합니다.
   `profiles` 테이블, RLS 정책, 회원가입 시 프로필을 만드는 트리거가 함께 생성됩니다.
3. **Project Settings → Data API / API Keys**에서 URL과 공개 키를 복사해 `.env`에 넣습니다.
4. `EXPO_PUBLIC_AUTH_MODE`를 `supabase`로 바꾸고 개발 서버를 다시 시작합니다.
   환경 변수는 번들 시점에 값이 박히므로 재시작 없이는 반영되지 않습니다.

MVP 시연 중에는 **Authentication → Sign In / Providers → Email**에서 `Confirm email`을 꺼 두는 편이
편합니다. 켜 두면 가입 직후 로그인 상태가 되지 않고 "가입 확인 메일을 보냈습니다" 안내가 나옵니다.

계정 정보가 나뉘어 저장되는 구조입니다.

| 저장 위치 | 내용 |
| --- | --- |
| `auth.users` (Supabase 관리) | 이메일, 비밀번호 해시, 세션 |
| `public.profiles` | 이름, 이용 유형(role), 연락처 |

이용 유형은 **반드시 `profiles`에서만** 읽습니다. `auth.users`의 `user_metadata`는 클라이언트가
값을 넣을 수 있어서, 그대로 믿으면 누구나 스스로를 관리자라고 주장할 수 있기 때문입니다.
같은 이유로 프로필을 만드는 트리거도 가입 요청에 담긴 유형을 그대로 쓰지 않고
보호자/간병인 중 하나로만 강제합니다. 관리자 지정은 운영자가 SQL로 직접 합니다.

## 개발 진행 상황

| Phase | 내용 | 상태 |
| --- | --- | --- |
| 1 | 프로젝트 설정 · 디자인 토큰 · 공통 컴포넌트 · Zustand | 완료 |
| 2 | 로그인/회원가입, 사용자 유형 분기 (Mock · Supabase 인증 어댑터) | 완료 |
| 3 | 보호자 환자 정보 · 간병 요청 작성 | 예정 |
| 4 | AI 자연어 분석 (Mock) · 구조화 결과 화면 | 예정 |
| 5 | 간병인 프로필 · 역량 · 자격 · 가능 시간 | 예정 |
| 6 | 매칭 알고리즘 · 추천 간병인 | 예정 |
| 7 | 매칭 수락/거절 · 간병 진행 | 예정 |
| 8 | 후기/평가 · 신뢰도 반영 | 예정 |
| 9 | 교육 · 퀴즈 · 수료 | 예정 |
| 10 | 노쇼 · 대체 간병인 추천 | 예정 |
| 11 | 관리자 기능 | 예정 |
| 12 | 전체 테스트 및 UI 개선 | 예정 |
