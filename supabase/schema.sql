-- AI 간병 매칭 플랫폼 — 인증에 필요한 스키마 (Phase 2)
--
-- 적용 방법: Supabase 대시보드 → SQL Editor 에 이 파일 내용을 붙여넣고 실행한다.
-- 여러 번 실행해도 안전하다 (테이블/트리거/정책 모두 존재 여부를 확인하고 만든다).
-- 다만 create table if not exists 는 이미 있는 테이블의 컬럼을 바꾸지 않는다.
-- 이미 적용한 뒤 컬럼을 고칠 때는 이 파일을 다시 돌리지 말고 alter table 을 따로 실행한다.
--
-- 로그인 계정 자체는 Supabase가 관리하는 auth.users 에 저장된다.
-- 이름/이용 유형/연락처처럼 서비스가 쓰는 정보는 public.profiles 에 둔다.

-- 1) 프로필 테이블 -----------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text not null,
  role text not null check (role in ('guardian', 'caregiver', 'admin')),
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is '앱에서 사용하는 사용자 정보. auth.users 와 1:1로 대응한다.';
comment on column public.profiles.role is '이용 유형. 관리자(admin)는 회원가입으로 만들 수 없고 운영자가 직접 바꿔 준다.';

-- 2) 접근 제어 (RLS) ---------------------------------------------------------
--
-- anon 키는 앱 번들에 그대로 들어가므로, 실제 접근 제어는 전적으로 RLS가 담당한다.
-- 기본 규칙: 자기 프로필만 읽고 수정할 수 있다.

alter table public.profiles enable row level security;

drop policy if exists "본인 프로필 조회" on public.profiles;
create policy "본인 프로필 조회"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "본인 프로필 수정" on public.profiles;
create policy "본인 프로필 수정"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- insert 정책은 두지 않는다. 프로필 생성은 아래 트리거만 할 수 있다.
-- (관리자가 모든 프로필을 보는 정책은 Phase 11에서 추가한다.)

-- 3) 회원가입 시 프로필 자동 생성 --------------------------------------------
--
-- 앱이 직접 insert 하지 않고 트리거가 만든다. 앱이 넣은 user_metadata 는
-- 사용자가 마음대로 바꿀 수 있는 값이므로, role 은 여기서 다시 걸러낸다.
-- 그래서 스스로 admin 으로 가입하는 것은 불가능하다.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, name, role, phone)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), '이름 없음'),
    case
      when new.raw_user_meta_data ->> 'role' = 'caregiver' then 'caregiver'
      else 'guardian'
    end,
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) updated_at 자동 갱신 ----------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- 5) 관리자 계정 만들기 ------------------------------------------------------
--
-- 관리자는 보통 회원가입으로 만든 계정의 유형을 운영자가 바꿔 주는 방식으로 만든다.
-- 아래 문장의 이메일을 바꿔서 SQL Editor 에서 실행한다.
--
--   update public.profiles set role = 'admin' where email = 'admin@example.com';

-- ===========================================================================
-- Phase 3 — 환자 정보와 간병 요청
-- ===========================================================================
--
-- 관계
--   profiles(보호자) 1 ── N patients(환자) 1 ── N care_requests(간병 요청)
--
-- 요청은 환자를 가리키는 동시에 보호자도 함께 들고 있다.
-- 조회할 때마다 환자 테이블을 조인하지 않고 RLS 조건을 걸기 위해서다.
-- 다른 보호자의 환자로 요청을 만드는 일은 아래 복합 외래키가 막는다.

-- 6) 환자 --------------------------------------------------------------------

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  -- 나이 대신 출생연도를 저장한다. 나이는 해가 바뀌면 틀린 값이 된다.
  birth_year smallint not null check (birth_year between 1900 and 2100),
  gender text not null check (gender in ('male', 'female', 'other')),
  -- 보호자가 보는 화면에서 환자를 구분하는 데 쓴다 (어머니, 아버지, 배우자 …)
  relationship text,
  -- 질환·증상 목록. 매칭에서 간병인 역량과 겹치는지 비교한다.
  conditions text[] not null default '{}',
  mobility text not null check (mobility in ('independent', 'assisted', 'wheelchair', 'bedridden')),
  cognition text not null default 'normal' check (cognition in ('normal', 'mild', 'severe')),
  care_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- care_requests 가 (환자, 보호자) 짝을 통째로 참조할 수 있게 한다
  unique (id, guardian_id)
);

comment on table public.patients is '보호자가 등록한 간병 대상자. 보호자 한 명이 여러 명을 등록할 수 있다.';
comment on column public.patients.conditions is '질환·증상 목록. 매칭 점수 계산에서 간병인 역량과 비교한다.';
comment on column public.patients.mobility is '거동 상태: 자립 / 부축 필요 / 휠체어 / 와상';

create index if not exists patients_guardian_id_idx on public.patients (guardian_id);
create index if not exists patients_conditions_idx on public.patients using gin (conditions);

-- 환자 정보는 민감한 건강 정보다. 등록한 보호자 본인만 다룰 수 있다.
-- 간병인은 매칭이 확정된 뒤에야 필요한 항목만 볼 수 있어야 하므로,
-- 그 정책은 matches 테이블이 생기는 Phase 7에서 추가한다.
alter table public.patients enable row level security;

drop policy if exists "보호자 본인 환자 조회" on public.patients;
create policy "보호자 본인 환자 조회"
  on public.patients for select
  to authenticated
  using ((select auth.uid()) = guardian_id);

drop policy if exists "보호자 본인 환자 등록" on public.patients;
create policy "보호자 본인 환자 등록"
  on public.patients for insert
  to authenticated
  with check ((select auth.uid()) = guardian_id);

drop policy if exists "보호자 본인 환자 수정" on public.patients;
create policy "보호자 본인 환자 수정"
  on public.patients for update
  to authenticated
  using ((select auth.uid()) = guardian_id)
  -- with check 가 없으면 수정하면서 guardian_id 를 남의 것으로 바꿔치기할 수 있다
  with check ((select auth.uid()) = guardian_id);

drop policy if exists "보호자 본인 환자 삭제" on public.patients;
create policy "보호자 본인 환자 삭제"
  on public.patients for delete
  to authenticated
  using ((select auth.uid()) = guardian_id);

drop trigger if exists patients_set_updated_at on public.patients;
create trigger patients_set_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

-- 7) 간병 요청 ---------------------------------------------------------------

create table if not exists public.care_requests (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references public.profiles (id) on delete cascade,
  patient_id uuid not null,

  -- 보호자가 평소 말하듯 적은 원문. AI 구조화의 입력이자 화면에 그대로 보여 준다.
  request_text text not null check (char_length(trim(request_text)) >= 10),

  care_type text not null check (care_type in ('hospital', 'home', 'facility')),
  -- 매칭 대상 지역 (시군구 단위)
  region text not null check (char_length(trim(region)) > 0),

  start_date date not null,
  -- 종료일 미정이면 null
  end_date date,
  -- 하루 중 간병 시간대. 야간 간병이 있으므로 끝 시각이 시작보다 이를 수 있다.
  daily_start_time time,
  daily_end_time time,

  -- 요청에 필요한 간병 역량 (흡인, 체위 변경, 식사 보조 …)
  required_skills text[] not null default '{}',
  preferred_caregiver_gender text not null default 'any'
    check (preferred_caregiver_gender in ('male', 'female', 'any')),
  -- 일당 예산(원). 미정이면 null
  budget_per_day integer check (budget_per_day is null or budget_per_day >= 0),

  status text not null default 'pending'
    check (status in ('pending', 'matched', 'in_progress', 'completed', 'cancelled', 'no_show')),

  -- Phase 4에서 AI가 원문을 구조화한 결과를 채운다. 그때까지는 null이다.
  -- 사람이 고른 조건(위 컬럼들)과 AI가 뽑은 조건을 섞지 않기 위해 따로 둔다.
  ai_conditions jsonb,
  ai_analyzed_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint care_requests_period_valid check (end_date is null or end_date >= start_date),

  -- 환자와 보호자를 함께 참조한다. 덕분에 남의 환자로 요청을 만들 수 없고,
  -- 요청의 guardian_id 가 환자의 guardian_id 와 어긋나는 상태도 생기지 않는다.
  constraint care_requests_patient_fkey foreign key (patient_id, guardian_id)
    references public.patients (id, guardian_id) on delete cascade
);

comment on table public.care_requests is '보호자가 올린 간병 요청. 매칭·간병 진행·평가가 모두 이 행을 기준으로 이어진다.';
comment on column public.care_requests.request_text is '보호자가 자연어로 적은 요청 원문.';
comment on column public.care_requests.ai_conditions is 'Phase 4에서 AI가 원문을 구조화한 결과(JSON). 사람이 고른 조건과 구분해서 보관한다.';
comment on column public.care_requests.status is 'pending 대기중 / matched 매칭 완료 / in_progress 진행중 / completed 종료 / cancelled 취소 / no_show 노쇼';

create index if not exists care_requests_guardian_id_idx on public.care_requests (guardian_id);
create index if not exists care_requests_patient_id_idx on public.care_requests (patient_id);
-- 매칭 대상(대기중 요청)을 지역·상태로 훑는 조회에 쓴다
create index if not exists care_requests_status_region_idx on public.care_requests (status, region);
create index if not exists care_requests_required_skills_idx
  on public.care_requests using gin (required_skills);

alter table public.care_requests enable row level security;

drop policy if exists "보호자 본인 요청 조회" on public.care_requests;
create policy "보호자 본인 요청 조회"
  on public.care_requests for select
  to authenticated
  using ((select auth.uid()) = guardian_id);

drop policy if exists "보호자 본인 요청 등록" on public.care_requests;
create policy "보호자 본인 요청 등록"
  on public.care_requests for insert
  to authenticated
  with check ((select auth.uid()) = guardian_id);

drop policy if exists "보호자 본인 요청 수정" on public.care_requests;
create policy "보호자 본인 요청 수정"
  on public.care_requests for update
  to authenticated
  using ((select auth.uid()) = guardian_id)
  with check ((select auth.uid()) = guardian_id);

-- 진행 중이거나 이미 끝난 요청은 지우지 않는다. 매칭·평가 기록이 함께 사라지기 때문이다.
-- 보호자가 그만두려는 경우에는 삭제 대신 status 를 cancelled 로 바꾼다.
drop policy if exists "보호자 대기중 요청 삭제" on public.care_requests;
create policy "보호자 대기중 요청 삭제"
  on public.care_requests for delete
  to authenticated
  using ((select auth.uid()) = guardian_id and status = 'pending');

drop trigger if exists care_requests_set_updated_at on public.care_requests;
create trigger care_requests_set_updated_at
  before update on public.care_requests
  for each row execute function public.set_updated_at();

-- 8) 아직 열지 않은 접근 ------------------------------------------------------
--
-- 간병인과 관리자는 지금 이 두 테이블을 전혀 읽을 수 없다.
-- RLS 는 정책이 없으면 거부이므로, 필요한 만큼만 나중에 열어 준다.
--
--   Phase 6 (매칭): 간병인이 대기중 요청을 보려면 두 가지 중 하나를 고른다.
--     (a) 매칭 계산을 Edge Function 에서 하고 결과만 내려 준다 (요청 원문 비공개 유지)
--     (b) 이름·연락처 같은 식별 정보를 뺀 뷰를 만들고 그 뷰에만 select 를 허용한다
--   Phase 7 (매칭 성사): matches 테이블을 만들고, 배정된 간병인만
--     해당 요청과 환자 정보를 볼 수 있도록 matches 를 참조하는 정책을 추가한다.
--   Phase 11 (관리자): profiles.role = 'admin' 인 사용자에게 조회 권한을 준다.
--     이때 정책 안에서 profiles 를 다시 조회하면 재귀가 생기므로,
--     역할을 JWT 클레임에 넣거나 security definer 함수로 감싸서 판단한다.
