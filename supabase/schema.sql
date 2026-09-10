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
-- 자기 role 을 바꾸지 못하게 막는 트리거와, 관리자가 모든 프로필을 보는 정책은
-- Phase 11 의 50) 51) 에서 함께 붙인다.

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

-- ===========================================================================
-- Phase 4 — 간병인이 요청을 보고 수락하기
-- ===========================================================================
--
-- 여기서 처음으로 간병인이 다른 사람의 자료를 읽는다.
-- care_requests 와 patients 에 간병인용 select 정책을 추가하지 않는다.
-- 정책을 열면 "테이블 전체를 읽되 조건에 맞는 행만"이 되어, 보호자 식별자나
-- 특이사항처럼 아직 보여 줄 이유가 없는 컬럼까지 함께 열리기 때문이다.
--
-- 대신 창구를 두 개만 만든다.
--   조회: public.caregiver_care_requests 뷰 — 필요한 컬럼만, 이름은 가려서
--   수락: public.accept_care_request() 함수 — 대기중인 요청만 바꾼다
-- 두 창구 모두 호출한 사람이 간병인인지 데이터베이스가 직접 확인한다.

-- 9) 매칭된 간병인 기록 ------------------------------------------------------
--
-- Phase 7에서 matches 테이블(수락·거절 이력, 간병 진행 기록)을 따로 만든다.
-- 지금은 "이 요청을 누가 가져갔는가" 한 가지만 필요하므로 요청 행에 함께 둔다.

alter table public.care_requests
  add column if not exists matched_caregiver_id uuid references public.profiles (id) on delete set null;

alter table public.care_requests
  add column if not exists matched_at timestamptz;

comment on column public.care_requests.matched_caregiver_id is '요청을 수락한 간병인. Phase 7에서 matches 테이블로 옮긴다.';

-- 수락한 간병인이 있는데 상태가 pending 으로 남아 있는 어긋난 행을 막는다
alter table public.care_requests
  drop constraint if exists care_requests_matched_state_valid;
alter table public.care_requests
  add constraint care_requests_matched_state_valid check (
    matched_caregiver_id is null or status <> 'pending'
  );

-- 간병인이 "내가 수락한 요청"을 훑는 조회에 쓴다
create index if not exists care_requests_matched_caregiver_idx
  on public.care_requests (matched_caregiver_id);

-- 10) 역할 판별과 이름 가리기 -------------------------------------------------
--
-- 정책이나 뷰 안에서 profiles 를 그대로 조회하면 profiles 의 정책이 다시 걸려 재귀가 생긴다.
-- security definer 함수로 감싸서 한 번만 확인한다.

create or replace function public.is_caregiver()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'caregiver'
  );
$$;

comment on function public.is_caregiver() is '로그인한 사용자가 간병인인지 확인한다. 정책·뷰 안에서 profiles 를 직접 조회하면 재귀가 생겨 함수로 감싼다.';

-- '김영희' → '김OO'. 앱의 src/lib/privacy.ts 가 Mock 모드에서 같은 규칙을 쓴다.
create or replace function public.mask_person_name(full_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when full_name is null then ''
    when char_length(trim(full_name)) <= 1 then trim(full_name)
    else left(trim(full_name), 1) || repeat('O', char_length(trim(full_name)) - 1)
  end;
$$;

-- 11) 간병인이 보는 요청 뷰 ---------------------------------------------------
--
-- security_invoker = false (기본값)이므로 뷰는 소유자 권한으로 실행되어
-- care_requests / patients 의 RLS 를 지나간다. 그래서 어떤 행을 내보낼지는
-- 전적으로 아래 where 절이 정한다. 두 가지 행만 나간다.
--   (1) 아직 아무도 수락하지 않은 요청 (status = 'pending')
--   (2) 지금 로그인한 간병인이 수락한 요청
-- 그리고 간병인이 아닌 사용자에게는 한 행도 나가지 않는다.
--
-- 환자 이름은 수락하기 전까지 가린다. 나이·성별·거동/인지 상태·질환은
-- 요청을 받을 수 있는지 판단하는 데 필요하므로 그대로 내보내고,
-- 특이사항(care_notes)과 보호자 정보는 아예 넣지 않는다.

create or replace view public.caregiver_care_requests
with (security_invoker = false) as
select
  r.id,
  r.request_text,
  r.care_type,
  r.region,
  r.start_date,
  r.end_date,
  r.daily_start_time,
  r.daily_end_time,
  r.required_skills,
  r.preferred_caregiver_gender,
  r.budget_per_day,
  r.status,
  r.matched_caregiver_id,
  r.matched_at,
  r.created_at,
  r.updated_at,
  case
    when r.matched_caregiver_id = (select auth.uid()) then p.name
    else public.mask_person_name(p.name)
  end as patient_name,
  p.birth_year as patient_birth_year,
  p.gender as patient_gender,
  p.mobility as patient_mobility,
  p.cognition as patient_cognition,
  p.conditions as patient_conditions
from public.care_requests r
join public.patients p on p.id = r.patient_id
where public.is_caregiver()
  and (r.status = 'pending' or r.matched_caregiver_id = (select auth.uid()));

comment on view public.caregiver_care_requests is '간병인이 요청을 읽는 유일한 창구. 대기중 요청과 본인이 수락한 요청만, 보호자 정보 없이 내보낸다.';

revoke all on public.caregiver_care_requests from anon;
grant select on public.caregiver_care_requests to authenticated;

-- 12) 요청 수락 --------------------------------------------------------------
--
-- 조회와 수정을 한 문장에서 처리한다. "대기중인지 확인한 뒤 바꾸기"를 앱에서 두 번에 나눠 하면
-- 그 사이에 다른 간병인이 같은 요청을 가져갈 수 있다. update ... where status = 'pending' 은
-- 행 잠금 안에서 판정되므로, 동시에 눌러도 한 명만 성공한다.
--
-- 성공하면 요청 id를, 이미 넘어간 요청이면 null 을 돌려준다.
-- 없는 요청과 이미 매칭된 요청을 구분하지 않는다 — 구분해서 알려 주면
-- 아무 uuid나 넣어 보며 요청의 존재 여부를 알아낼 수 있다.

create or replace function public.accept_care_request(request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caregiver uuid := (select auth.uid());
  accepted_id uuid;
begin
  if caregiver is null or not public.is_caregiver() then
    raise exception '간병인만 요청을 수락할 수 있습니다.' using errcode = '42501';
  end if;

  update public.care_requests
     set status = 'matched',
         matched_caregiver_id = caregiver,
         matched_at = now()
   where id = request_id
     and status = 'pending'
  returning id into accepted_id;

  return accepted_id;
end;
$$;

comment on function public.accept_care_request(uuid) is '대기중 요청을 수락해 matched 로 바꾼다. 이미 넘어간 요청이면 null 을 돌려준다.';

revoke all on function public.accept_care_request(uuid) from public, anon;
grant execute on function public.accept_care_request(uuid) to authenticated;

-- 13) 남은 구멍 --------------------------------------------------------------
--
-- 보호자의 update 정책은 아직 컬럼을 가리지 않아서, 보호자가 자기 요청의
-- matched_caregiver_id 를 직접 채워 넣을 수 있다. 남의 자료를 건드리지는 못하므로
-- 정보가 새지는 않지만, 매칭 기록이 어긋날 수는 있다.
-- Phase 7에서 matches 테이블을 만들면서 보호자가 바꿀 수 있는 컬럼을 좁힌다.

-- ===========================================================================
-- Phase 5 — 간병인 프로필과 가능 시간
-- ===========================================================================
--
-- 관계
--   profiles(간병인) 1 ── 1 caregiver_profiles ── N caregiver_availability
--
-- 프로필과 시간표를 나눈 이유는 조회 방향이 다르기 때문이다.
-- 프로필은 "이 사람이 누구인가"를 한 행으로 읽고, 시간표는 매칭이
-- "이 요일 이 시간에 가능한 사람"을 훑는다. 후자는 칸 하나가 한 행일 때 가장 단순하다.

-- 14) 간병인 프로필 ----------------------------------------------------------

create table if not exists public.caregiver_profiles (
  -- profiles.id 를 그대로 기본키로 쓴다. 간병인 한 명당 프로필은 하나뿐이다.
  id uuid primary key references public.profiles (id) on delete cascade,

  -- 요청의 preferred_caregiver_gender 와 맞춰 보는 값
  gender text not null check (gender in ('male', 'female', 'other')),

  -- 경력이 없어도 등록할 수 있어야 하므로 0을 허용한다
  years_of_experience smallint not null default 0
    check (years_of_experience between 0 and 60),

  -- 보유 자격 (요양보호사, 간호조무사 …). 앱의 src/lib/care-options.ts 목록에서 고른다.
  certifications text[] not null default '{}',
  -- 할 수 있는 간병 역량. 요청의 required_skills 와 같은 목록을 쓴다.
  skills text[] not null default '{}',
  -- 맡을 수 있는 간병 장소
  care_types text[] not null default '{}',
  -- 근무 가능 지역 (시군구 단위). 요청의 region 과 맞춰 본다.
  regions text[] not null default '{}',

  introduction text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.caregiver_profiles is '간병인이 등록한 역량·경력·근무 조건. profiles 와 1:1이다.';
comment on column public.caregiver_profiles.skills is '할 수 있는 간병 역량. care_requests.required_skills 와 겹치는 개수로 매칭 점수를 낸다.';
comment on column public.caregiver_profiles.regions is '근무 가능 지역. care_requests.region 과 맞춰 본다.';

-- 매칭이 역량·지역으로 후보를 좁히는 조회에 쓴다
create index if not exists caregiver_profiles_skills_idx
  on public.caregiver_profiles using gin (skills);
create index if not exists caregiver_profiles_regions_idx
  on public.caregiver_profiles using gin (regions);

alter table public.caregiver_profiles enable row level security;

-- 지금은 본인만 다룰 수 있다.
-- 보호자에게 간병인을 보여 주는 일은 추천 결과를 내보내는 Phase 6에서 별도 창구로 연다.
drop policy if exists "간병인 본인 프로필 조회" on public.caregiver_profiles;
create policy "간병인 본인 프로필 조회"
  on public.caregiver_profiles for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "간병인 본인 프로필 등록" on public.caregiver_profiles;
create policy "간병인 본인 프로필 등록"
  on public.caregiver_profiles for insert
  to authenticated
  -- 보호자가 간병인 프로필을 만들 수는 없다
  with check ((select auth.uid()) = id and public.is_caregiver());

drop policy if exists "간병인 본인 프로필 수정" on public.caregiver_profiles;
create policy "간병인 본인 프로필 수정"
  on public.caregiver_profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop trigger if exists caregiver_profiles_set_updated_at on public.caregiver_profiles;
create trigger caregiver_profiles_set_updated_at
  before update on public.caregiver_profiles
  for each row execute function public.set_updated_at();

-- 15) 가능 시간표 ------------------------------------------------------------
--
-- 칸 하나가 한 행이다 (월요일 오전 = 한 행).
-- 시각을 분 단위로 받지 않고 하루를 오전/오후/야간 세 덩어리로 나눈다.
-- 간병 근무가 실제로 이렇게 짜이고, 요청의 시간대와 겹치는지 보는 데도 이만큼이면 충분하다.

create table if not exists public.caregiver_availability (
  caregiver_id uuid not null references public.caregiver_profiles (id) on delete cascade,
  weekday text not null check (weekday in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')),
  slot text not null check (slot in ('morning', 'afternoon', 'night')),
  created_at timestamptz not null default now(),
  -- 같은 칸이 두 번 들어가지 않게 한다
  primary key (caregiver_id, weekday, slot)
);

comment on table public.caregiver_availability is '간병인이 근무할 수 있는 요일·시간대. 칸 하나가 한 행이다.';
comment on column public.caregiver_availability.slot is 'morning 06~12시 / afternoon 12~18시 / night 18~06시';

-- 매칭이 "이 요일 이 시간에 가능한 간병인"을 훑는 조회에 쓴다
create index if not exists caregiver_availability_slot_idx
  on public.caregiver_availability (weekday, slot);

alter table public.caregiver_availability enable row level security;

drop policy if exists "간병인 본인 가능시간 조회" on public.caregiver_availability;
create policy "간병인 본인 가능시간 조회"
  on public.caregiver_availability for select
  to authenticated
  using ((select auth.uid()) = caregiver_id);

drop policy if exists "간병인 본인 가능시간 등록" on public.caregiver_availability;
create policy "간병인 본인 가능시간 등록"
  on public.caregiver_availability for insert
  to authenticated
  with check ((select auth.uid()) = caregiver_id);

-- 표 전체를 바꿀 때 지우고 다시 넣으므로 삭제 정책이 필요하다
drop policy if exists "간병인 본인 가능시간 삭제" on public.caregiver_availability;
create policy "간병인 본인 가능시간 삭제"
  on public.caregiver_availability for delete
  to authenticated
  using ((select auth.uid()) = caregiver_id);

-- update 정책은 두지 않는다. 칸은 켜거나 끄는 것뿐이라 고칠 내용이 없다.

-- ===========================================================================
-- Phase 6 — 매칭과 추천
-- ===========================================================================
--
-- 점수 계산은 여기에 두지 않는다. 앱의 src/lib/matching.ts 한 곳에서만 한다.
-- 같은 규칙을 SQL에도 적으면 두 구현이 조금씩 어긋나기 시작하고,
-- 그러면 보호자 화면의 점수와 간병인 화면의 점수가 달라진다.
--
-- 데이터베이스가 맡는 것은 "누구를 보여 줘도 되는가" 하나다.
--   - 본인이 올린 요청에 대해서만 추천을 볼 수 있다
--   - 아무리 점수가 높아도 될 수 없는 사람(맡지 않는 장소, 지정하지 않은 성별)은 빼고 준다
--   - 이름은 매칭이 확정되기 전까지 가린다

-- 16) 희망 일당 --------------------------------------------------------------
--
-- 요청의 budget_per_day 와 맞춰 보기 위한 값이다. 정하지 않으면 null(협의)이다.

alter table public.caregiver_profiles
  add column if not exists min_daily_wage integer;

alter table public.caregiver_profiles
  drop constraint if exists caregiver_profiles_min_daily_wage_valid;
alter table public.caregiver_profiles
  add constraint caregiver_profiles_min_daily_wage_valid check (
    min_daily_wage is null or min_daily_wage >= 0
  );

comment on column public.caregiver_profiles.min_daily_wage is '희망 일당(원). care_requests.budget_per_day 와 맞춰 본다. null 이면 협의.';

-- 17) 추천 후보 --------------------------------------------------------------
--
-- 점수 없이 "후보가 될 수 있는 사람"만 돌려준다. 순위는 앱이 매긴다.
-- security definer 로 caregiver_profiles 의 RLS를 지나가되,
-- 어떤 행이 나갈지는 아래 where 절이 전적으로 정한다.

create or replace function public.recommendation_candidates(request_id uuid)
returns table (
  caregiver_id uuid,
  name text,
  gender text,
  years_of_experience smallint,
  certifications text[],
  skills text[],
  care_types text[],
  regions text[],
  min_daily_wage integer,
  introduction text,
  -- 'mon:morning' 모양. 함수 반환 타입을 단순하게 두려고 문자열로 내보낸다.
  availability text[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  req public.care_requests%rowtype;
begin
  select * into req from public.care_requests r where r.id = request_id;

  -- 없는 요청과 남의 요청을 구분해서 알려 주지 않는다.
  -- 구분하면 아무 uuid나 넣어 보며 요청의 존재 여부를 알아낼 수 있다.
  if req.id is null or req.guardian_id <> (select auth.uid()) then
    return;
  end if;

  return query
  select
    p.id,
    public.mask_person_name(pr.name),
    p.gender,
    p.years_of_experience,
    p.certifications,
    p.skills,
    p.care_types,
    p.regions,
    p.min_daily_wage,
    p.introduction,
    coalesce(
      array_agg(a.weekday || ':' || a.slot) filter (where a.weekday is not null),
      '{}'
    )
  from public.caregiver_profiles p
  join public.profiles pr on pr.id = p.id
  left join public.caregiver_availability a on a.caregiver_id = p.id
  where
    -- 제외 조건 1: 맡지 않는 간병 장소
    req.care_type = any (p.care_types)
    -- 제외 조건 2: 보호자가 지정하지 않은 성별
    and (req.preferred_caregiver_gender = 'any' or p.gender = req.preferred_caregiver_gender)
    -- 이미 이 요청을 수락한 사람은 다시 추천하지 않는다
    and p.id is distinct from req.matched_caregiver_id
  group by p.id, pr.name
  -- 앱이 순위를 매기므로 여기서는 자르는 기준만 정해 둔다.
  -- 간병인이 50명을 넘어가면 경력이 짧은 쪽부터 잘린다 — 그때는 지역으로도 걸러야 한다.
  order by p.years_of_experience desc, p.id
  limit 50;
end;
$$;

comment on function public.recommendation_candidates(uuid) is '요청의 추천 후보가 될 수 있는 간병인. 점수는 매기지 않는다. 본인이 올린 요청에만 쓸 수 있다.';

revoke all on function public.recommendation_candidates(uuid) from public, anon;
grant execute on function public.recommendation_candidates(uuid) to authenticated;

-- ===========================================================================
-- Phase 7 — 매칭 이력과 간병 진행
-- ===========================================================================
--
-- Phase 4까지는 "이 요청을 누가 가져갔는가"를 요청 행(care_requests.matched_caregiver_id)에
-- 함께 적어 두었다. 한 요청에 간병인이 한 번만 붙는 동안에는 그것으로 충분했지만,
-- 실제 간병은 수락 이후에도 계속 움직인다 — 시작하고, 끝나고, 중간에 그만두기도 한다.
-- 요청 행 하나에 이 흐름을 모두 눌러 담으면 "지금 상태"만 남고 "무슨 일이 있었는지"는 사라진다.
--
-- 그래서 수락 이후의 이야기는 matches 테이블이 한 줄씩 따로 들고 간다.
--   요청 1건 ── N matches (수락할 때마다 한 줄. 취소되면 그 줄은 이력으로 남는다)
--
-- 살아 있는 매칭(accepted·in_progress)은 요청당 언제나 최대 한 줄이며,
-- 이 규칙은 아래 부분 유니크 인덱스가 지킨다. 취소된 줄은 몇 개든 쌓일 수 있다.
--
-- care_requests.status 와 matches.status 는 아래 함수들이 함께 옮긴다.
--   수락      accepted    → 요청 matched
--   간병 시작  in_progress → 요청 in_progress
--   간병 종료  completed   → 요청 completed
--   취소      cancelled   → 시작 전이면 요청 pending 으로 되돌리고(다시 매칭 가능),
--                          시작한 뒤면 요청 cancelled 로 닫는다

-- 18) 요청을 (요청, 보호자) 짝으로 참조하기 ----------------------------------
--
-- matches 가 보호자를 함께 들고 있어야 RLS 조건에서 요청을 조인하지 않고 판정할 수 있다.
-- 다만 그 값이 요청의 보호자와 어긋나면 안 되므로, patients ← care_requests 와 같은
-- 복합 외래키를 쓴다. 그러려면 참조 대상에 (id, guardian_id) 유니크 제약이 있어야 한다.

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'care_requests_id_guardian_key'
  ) then
    alter table public.care_requests
      add constraint care_requests_id_guardian_key unique (id, guardian_id);
  end if;
end $$;

-- 19) 매칭 -------------------------------------------------------------------

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  guardian_id uuid not null references public.profiles (id) on delete cascade,
  caregiver_id uuid not null references public.profiles (id) on delete cascade,

  status text not null default 'accepted'
    check (status in ('accepted', 'in_progress', 'completed', 'cancelled')),

  -- 상태가 바뀐 시각을 덮어쓰지 않고 각각 남긴다.
  -- updated_at 하나만 두면 "언제 시작했는지"를 나중에 되찾을 수 없다.
  accepted_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,

  -- 누가 그만두었는지. 보호자와 간병인 어느 쪽이든 취소할 수 있으므로 함께 적는다.
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancel_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- 남의 요청으로 매칭을 만들 수 없고, guardian_id 가 요청과 어긋나지도 않는다
  constraint matches_request_fkey foreign key (request_id, guardian_id)
    references public.care_requests (id, guardian_id) on delete cascade,

  -- 상태와 시각이 어긋난 행을 막는다 (진행중인데 시작 시각이 없는 행 등)
  constraint matches_status_time_valid check (
    (status <> 'in_progress' or started_at is not null)
    and (status <> 'completed' or completed_at is not null)
    and (status <> 'cancelled' or cancelled_at is not null)
    and (cancelled_at is null) = (cancelled_by is null)
  )
);

comment on table public.matches is '수락 이후의 간병 한 건. 취소되면 그 행은 이력으로 남고 요청은 새 매칭을 받을 수 있다.';
comment on column public.matches.status is 'accepted 수락됨 / in_progress 간병중 / completed 종료 / cancelled 취소';
comment on column public.matches.cancelled_by is '취소한 사람(profiles.id). 보호자와 간병인 어느 쪽이든 될 수 있다.';

-- 살아 있는 매칭은 요청당 하나뿐이다.
-- 두 간병인이 동시에 수락해도 두 번째 insert 가 여기서 막힌다 —
-- accept_care_request() 의 status = 'pending' 조건과 겹치는 이중 잠금이다.
create unique index if not exists matches_live_per_request_idx
  on public.matches (request_id)
  where status in ('accepted', 'in_progress');

create index if not exists matches_caregiver_id_idx
  on public.matches (caregiver_id, accepted_at desc);
create index if not exists matches_guardian_id_idx
  on public.matches (guardian_id, accepted_at desc);

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

alter table public.matches enable row level security;

-- 읽기만 정책으로 연다. 당사자 두 사람만 자기 매칭을 본다.
drop policy if exists "당사자 매칭 조회" on public.matches;
create policy "당사자 매칭 조회"
  on public.matches for select
  to authenticated
  using (
    (select auth.uid()) = guardian_id
    or (select auth.uid()) = caregiver_id
  );

-- insert/update/delete 정책은 두지 않는다. 정책이 없으면 거부다.
-- 상태를 바꾸는 일은 아래 함수 세 개만 할 수 있다. 앱이 직접 update 하도록 열어 두면
-- "간병을 시작하면 요청도 진행중으로 바뀐다" 같은 규칙이 화면 쪽으로 새어 나가고,
-- 화면이 하나 늘어날 때마다 같은 규칙을 다시 적게 된다.

-- 20) 요청 행에서 앱이 건드릴 수 없는 컬럼 ------------------------------------
--
-- Phase 4에 남겨 둔 구멍을 여기서 막는다. 그때는 보호자의 update 정책이 컬럼을 가리지 않아서
-- 보호자가 자기 요청의 matched_caregiver_id 를 직접 채워 넣을 수 있었다.
-- 정책(RLS)은 "어느 행"만 정하고 "어느 컬럼"은 정하지 못하므로 컬럼 권한으로 막는다.
-- security definer 함수는 소유자 권한으로 돌아가므로 아래 회수의 영향을 받지 않는다.

revoke update on public.care_requests from authenticated;
grant update (
  request_text,
  care_type,
  region,
  start_date,
  end_date,
  daily_start_time,
  daily_end_time,
  required_skills,
  preferred_caregiver_gender,
  budget_per_day,
  status
) on public.care_requests to authenticated;

-- status 는 아직 열어 둔다. 보호자가 요청을 거두는 취소가 앱에서 바로 update 로 나간다.
-- 매칭이 살아 있는 동안의 상태 이동은 아래 함수들이 맡으므로, 보호자가 status 를
-- 임의로 적더라도 matches 쪽 기록은 어긋나지 않는다.

-- 21) 매칭 상세 뷰 ------------------------------------------------------------
--
-- 매칭이 성사되면 서로를 알아야 간병이 시작된다. 이 뷰가 그 창구다.
-- 여기서 처음으로 간병인이 환자 특이사항(care_notes)과 보호자 연락처를 보고,
-- 보호자도 간병인의 이름과 연락처를 가려지지 않은 채로 본다.
--
-- 취소된 매칭은 다시 닫는다. 성사되지 않은 만남의 연락처와 특이사항을
-- 이력이라는 이유로 계속 열어 둘 까닭이 없다. 다만 자기 자신의 자료는 언제나 보인다.

create or replace view public.match_details
with (security_invoker = false) as
select
  m.id,
  m.request_id,
  m.guardian_id,
  m.caregiver_id,
  m.status,
  m.accepted_at,
  m.started_at,
  m.completed_at,
  m.cancelled_at,
  m.cancelled_by,
  m.cancel_reason,
  m.created_at,
  m.updated_at,

  r.request_text,
  r.care_type,
  r.region,
  r.start_date,
  r.end_date,
  r.daily_start_time,
  r.daily_end_time,
  r.required_skills,
  r.budget_per_day,

  case when v.viewer = m.guardian_id or v.engaged then pt.name
       else public.mask_person_name(pt.name) end as patient_name,
  pt.birth_year as patient_birth_year,
  pt.gender as patient_gender,
  pt.mobility as patient_mobility,
  pt.cognition as patient_cognition,
  pt.conditions as patient_conditions,
  case when v.viewer = m.guardian_id or v.engaged then pt.care_notes end as patient_care_notes,

  case when v.viewer = m.caregiver_id or v.engaged then cg.name
       else public.mask_person_name(cg.name) end as caregiver_name,
  case when v.viewer = m.caregiver_id or v.engaged then cg.phone end as caregiver_phone,

  case when v.viewer = m.guardian_id or v.engaged then gu.name
       else public.mask_person_name(gu.name) end as guardian_name,
  case when v.viewer = m.guardian_id or v.engaged then gu.phone end as guardian_phone
from public.matches m
join public.care_requests r on r.id = m.request_id
join public.patients pt on pt.id = r.patient_id
join public.profiles cg on cg.id = m.caregiver_id
join public.profiles gu on gu.id = m.guardian_id
-- 같은 판정을 열 개 가까이 되풀이하지 않도록 한 번만 계산해 둔다.
-- engaged = 취소되지 않은 매칭. 자기 자신의 자료는 engaged 와 무관하게 보인다.
cross join lateral (
  select (select auth.uid()) as viewer, m.status <> 'cancelled' as engaged
) v
where m.guardian_id = v.viewer or m.caregiver_id = v.viewer;

comment on view public.match_details is '매칭 당사자가 서로와 간병 내용을 읽는 창구. 취소된 매칭은 연락처와 특이사항을 다시 가린다.';

revoke all on public.match_details from anon;
grant select on public.match_details to authenticated;

-- 22) 수락 — 요청 상태와 매칭 행을 함께 만든다 ---------------------------------
--
-- Phase 4의 함수를 그대로 이어받되, 요청을 matched 로 바꾸는 일과 matches 행을 만드는 일을
-- 한 트랜잭션에 둔다. 둘을 앱에서 두 번에 나눠 부르면 앞만 성공한 요청이 남을 수 있다.
-- 돌려주는 값은 예전과 같은 요청 id 다 — 앱이 이미 이 값으로 화면을 다시 읽고 있다.

create or replace function public.accept_care_request(request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caregiver uuid := (select auth.uid());
  accepted public.care_requests%rowtype;
begin
  if caregiver is null or not public.is_caregiver() then
    raise exception '간병인만 요청을 수락할 수 있습니다.' using errcode = '42501';
  end if;

  update public.care_requests r
     set status = 'matched',
         matched_caregiver_id = caregiver,
         matched_at = now()
   where r.id = request_id
     and r.status = 'pending'
  returning * into accepted;

  -- 없는 요청과 이미 넘어간 요청을 구분하지 않는다 — 구분해서 알려 주면
  -- 아무 uuid나 넣어 보며 요청의 존재 여부를 알아낼 수 있다.
  if accepted.id is null then
    return null;
  end if;

  insert into public.matches (request_id, guardian_id, caregiver_id, status, accepted_at)
  values (accepted.id, accepted.guardian_id, caregiver, 'accepted', accepted.matched_at);

  return accepted.id;
end;
$$;

comment on function public.accept_care_request(uuid) is '대기중 요청을 수락해 matched 로 바꾸고 matches 행을 만든다. 이미 넘어간 요청이면 null 을 돌려준다.';

revoke all on function public.accept_care_request(uuid) from public, anon;
grant execute on function public.accept_care_request(uuid) to authenticated;

-- 23) 간병 시작 ---------------------------------------------------------------
--
-- 출근한 사람이 누르는 버튼이다. 그래서 당사자 간병인만 부를 수 있다.
-- 아래 세 함수 모두 조건에 맞는 행이 없으면 예외 대신 null 을 돌려준다.
-- 화면이 목록을 띄워 둔 사이에 상태가 바뀌는 일은 오류가 아니라 흔한 일이고,
-- 앱은 null 을 받으면 목록을 다시 불러오면 된다.

create or replace function public.start_care(match_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  started public.matches%rowtype;
begin
  update public.matches m
     set status = 'in_progress',
         started_at = now()
   where m.id = match_id
     and m.caregiver_id = actor
     and m.status = 'accepted'
  returning * into started;

  if started.id is null then
    return null;
  end if;

  update public.care_requests r
     set status = 'in_progress'
   where r.id = started.request_id;

  return started.id;
end;
$$;

comment on function public.start_care(uuid) is '수락한 간병을 진행중으로 바꾼다. 당사자 간병인만, accepted 상태에서만 된다.';

-- 24) 간병 종료 ---------------------------------------------------------------
--
-- 보호자와 간병인 어느 쪽이든 끝났다고 표시할 수 있다.
-- 한쪽만 누를 수 있게 하면 상대가 앱을 열지 않는 동안 간병이 계속 진행중으로 남는다.
-- 후기·평가(Phase 8)는 completed 가 된 매칭을 입구로 삼는다.

create or replace function public.complete_care(match_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  finished public.matches%rowtype;
begin
  update public.matches m
     set status = 'completed',
         completed_at = now()
   where m.id = match_id
     and (m.caregiver_id = actor or m.guardian_id = actor)
     and m.status = 'in_progress'
  returning * into finished;

  if finished.id is null then
    return null;
  end if;

  update public.care_requests r
     set status = 'completed'
   where r.id = finished.request_id;

  return finished.id;
end;
$$;

comment on function public.complete_care(uuid) is '진행중인 간병을 종료로 바꾼다. 보호자와 간병인 어느 쪽이든 부를 수 있다.';

-- 25) 매칭 취소 ---------------------------------------------------------------
--
-- 시작 전(accepted)에 취소하면 요청은 다시 대기중으로 돌아간다. 보호자는 새 요청을
-- 올리지 않아도 되고, 다른 간병인이 그대로 수락할 수 있다. 이때 matched_caregiver_id 를
-- 반드시 비운다 — 비우지 않으면 care_requests_matched_state_valid 제약에 걸린다.
--
-- 시작한 뒤(in_progress)에 취소하면 요청을 다시 열지 않고 닫는다. 간병이 중간에 끊긴 것은
-- 아직 아무도 오지 않은 상태와 다르고, 남은 기간을 그대로 다시 매칭하는 것도 맞지 않는다.
-- 노쇼와 대체 간병인 추천은 Phase 10에서 이 취소 기록을 입력으로 쓴다.

create or replace function public.cancel_match(match_id uuid, reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  cancelled public.matches%rowtype;
  was_started boolean;
begin
  update public.matches m
     set status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = actor,
         cancel_reason = nullif(trim(reason), '')
   where m.id = match_id
     and (m.caregiver_id = actor or m.guardian_id = actor)
     and m.status in ('accepted', 'in_progress')
  returning * into cancelled;

  if cancelled.id is null then
    return null;
  end if;

  was_started := cancelled.started_at is not null;

  update public.care_requests r
     set status = case when was_started then 'cancelled' else 'pending' end,
         matched_caregiver_id = case when was_started then r.matched_caregiver_id else null end,
         matched_at = case when was_started then r.matched_at else null end
   where r.id = cancelled.request_id;

  return cancelled.id;
end;
$$;

comment on function public.cancel_match(uuid, text) is '살아 있는 매칭을 취소한다. 시작 전이면 요청을 다시 대기중으로 되돌리고, 시작한 뒤면 요청을 닫는다.';

revoke all on function public.start_care(uuid) from public, anon;
grant execute on function public.start_care(uuid) to authenticated;

revoke all on function public.complete_care(uuid) from public, anon;
grant execute on function public.complete_care(uuid) to authenticated;

revoke all on function public.cancel_match(uuid, text) from public, anon;
grant execute on function public.cancel_match(uuid, text) to authenticated;

-- 26) 보호자가 요청을 거둘 때 -------------------------------------------------
--
-- 보호자의 요청 취소는 함수가 아니라 care_requests 를 바로 update 하는 경로로 들어온다
-- (Phase 3부터 그랬고, 요청을 거두는 일 자체는 매칭과 상관없이 할 수 있어야 한다).
-- 그 경로로는 matches 가 그대로 남아, 간병인 화면에는 살아 있는 간병으로 보이게 된다.
-- 요청이 닫히면 그 위의 매칭도 함께 닫히도록 트리거로 잇는다.
--
-- 앱이 두 번에 나눠 호출하게 하지 않는 이유는, 그 사이에 앱이 꺼지면
-- 요청은 취소됐는데 매칭은 살아 있는 상태가 그대로 남기 때문이다.

create or replace function public.cancel_matches_on_request_cancel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    update public.matches m
       set status = 'cancelled',
           cancelled_at = now(),
           -- 취소한 사람을 알 수 없는 경로(관리 작업 등)라면 보호자가 거둔 것으로 본다
           cancelled_by = coalesce((select auth.uid()), new.guardian_id),
           cancel_reason = coalesce(m.cancel_reason, '보호자가 요청을 취소했습니다.')
     where m.request_id = new.id
       and m.status in ('accepted', 'in_progress');
  end if;

  return new;
end;
$$;

comment on function public.cancel_matches_on_request_cancel() is '요청이 취소되면 그 요청에 살아 있던 매칭도 함께 취소한다.';

-- cancel_match() 가 요청을 닫는 경우에도 이 트리거가 돌지만, 그때 매칭은 이미 cancelled 이라
-- where 절에 걸리지 않는다. 서로를 다시 부르지 않는다.
drop trigger if exists care_requests_cancel_matches on public.care_requests;
create trigger care_requests_cancel_matches
  after update of status on public.care_requests
  for each row execute function public.cancel_matches_on_request_cancel();

-- 27) 아직 열지 않은 것 -------------------------------------------------------
--
--   Phase 8 (후기): completed 매칭에만 후기를 달 수 있게 한다. 매칭 한 건당 한 번씩,
--     보호자와 간병인이 서로에게. reviews 테이블이 matches.id 를 가리킨다.
--   Phase 10 (노쇼): cancelled 매칭 중 시작 예정 시각이 지난 뒤에 끊긴 것을 노쇼로 구분하고,
--     같은 요청에 대체 간병인을 추천한다. care_requests.status 의 no_show 가 그 자리다.
--   Phase 11 (관리자): 관리자가 모든 매칭을 조회한다. 정책 안에서 profiles 를 다시 조회하면
--     재귀가 생기므로 is_caregiver() 처럼 security definer 함수로 감싼다.

-- ===========================================================================
-- Phase 8 — 후기와 신뢰도
-- ===========================================================================
--
-- 후기는 매칭에 달린다. 사람이 아니라 "함께한 간병 한 건"에 달려야
-- 근거 없는 평가가 쌓이지 않는다. 그래서 reviews 는 matches.id 를 가리키고,
-- 끝난 간병(completed)에만 쓸 수 있다.
--
--   matches 1 ──< reviews (한 매칭에 최대 두 줄: 보호자→간병인, 간병인→보호자)
--
-- 평균 별점은 컬럼으로 들고 있지 않고 그때그때 센다. 아래 user_ratings 뷰가 그 자리다.
-- 프로필에 rating_avg 를 적어 두면 후기가 지워지거나 고쳐질 때마다 두 값이 어긋나기 시작하고,
-- 어긋난 평균은 아무도 바로 알아차리지 못한다. 후기 수가 만 단위로 늘어나기 전까지
-- 집계는 인덱스 하나로 충분하다.

-- 27) 후기 -------------------------------------------------------------------

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id) on delete cascade,
  reviewee_id uuid not null references public.profiles (id) on delete cascade,

  rating smallint not null check (rating between 1 and 5),
  comment text,

  created_at timestamptz not null default now(),

  -- 한 매칭에 대해 한 사람은 한 번만 쓴다. 상대도 각자 한 줄을 쓰므로 매칭당 최대 두 줄이다.
  constraint reviews_one_per_reviewer unique (match_id, reviewer_id),
  -- 자기 자신에게는 쓸 수 없다
  constraint reviews_not_self check (reviewer_id <> reviewee_id)
);

comment on table public.reviews is '끝난 간병 한 건에 대한 상호 평가. 매칭당 사람마다 한 줄씩.';
comment on column public.reviews.reviewee_id is '평가를 받는 사람. 매칭의 상대편이며 앱이 아니라 create_review() 가 정한다.';

-- 평균 별점을 세는 조회에 쓴다
create index if not exists reviews_reviewee_id_idx on public.reviews (reviewee_id);
create index if not exists reviews_match_id_idx on public.reviews (match_id);

alter table public.reviews enable row level security;

-- 원문(코멘트)까지 그대로 읽는 것은 당사자 두 사람뿐이다.
-- 다른 사람에게 보여 주는 일은 아래 public_reviews() 함수가 맡는다 — 그쪽은 작성자 이름을 가린다.
drop policy if exists "후기 당사자 조회" on public.reviews;
create policy "후기 당사자 조회"
  on public.reviews for select
  to authenticated
  using (
    (select auth.uid()) = reviewer_id
    or (select auth.uid()) = reviewee_id
  );

-- insert/update/delete 정책은 두지 않는다.
-- 쓰는 일은 create_review() 만 할 수 있고, 한번 쓴 후기는 고치거나 지울 수 없다.
-- 평가는 상대의 신뢰도로 남는 기록이라, 나중에 조용히 바뀌면 아무도 믿을 수 없게 된다.

-- 28) 평균 별점 ---------------------------------------------------------------
--
-- 별점과 개수만 내보낸다. 코멘트 원문은 들어 있지 않으므로 누구에게 보여도 된다.
-- 보호자와 간병인 모두 평가를 받으므로 reviewee 기준으로 한 번에 센다.

create or replace view public.user_ratings
with (security_invoker = false) as
select
  r.reviewee_id as user_id,
  round(avg(r.rating)::numeric, 2) as rating_avg,
  count(*)::integer as review_count
from public.reviews r
group by r.reviewee_id;

comment on view public.user_ratings is '사람별 평균 별점과 후기 수. 코멘트는 담기지 않아 누구에게나 열어도 된다.';

revoke all on public.user_ratings from anon;
grant select on public.user_ratings to authenticated;

-- 29) 남에게 보여 주는 후기 ---------------------------------------------------
--
-- 간병인 프로필이나 추천 목록에서 "이 사람이 어떤 평가를 받았는가"를 읽는 창구다.
-- 작성자 이름은 성만 남긴다 — 후기를 누가 썼는지는 당사자끼리만 알면 된다.
-- 어느 간병 건이었는지(match_id)도 내보내지 않는다. 매칭을 되짚으면 환자가 드러난다.

create or replace function public.public_reviews(subject_id uuid)
returns table (
  id uuid,
  rating smallint,
  comment text,
  created_at timestamptz,
  reviewer_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.id,
    r.rating,
    r.comment,
    r.created_at,
    public.mask_person_name(p.name)
  from public.reviews r
  join public.profiles p on p.id = r.reviewer_id
  where r.reviewee_id = subject_id
  order by r.created_at desc
  limit 50;
$$;

comment on function public.public_reviews(uuid) is '이 사람이 받은 후기. 작성자 이름은 가려서 내보낸다.';

revoke all on function public.public_reviews(uuid) from public, anon;
grant execute on function public.public_reviews(uuid) to authenticated;

-- 30) 후기 쓰기 ---------------------------------------------------------------
--
-- 앱이 reviewee_id 를 정하지 않는다. 상대가 누구인지는 매칭이 이미 알고 있고,
-- 앱이 보낸 값을 믿으면 아무에게나 별점을 달 수 있다.
--
-- 끝난 간병에만 쓸 수 있다. 취소된 매칭은 평가할 간병이 없었던 것이고,
-- 진행 중인 간병을 평가하면 남은 기간에 그대로 영향을 준다.

create or replace function public.create_review(match_id uuid, rating smallint, comment text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.matches%rowtype;
  reviewee uuid;
  review_id uuid;
begin
  if rating is null or rating < 1 or rating > 5 then
    raise exception '별점은 1점에서 5점 사이여야 합니다.' using errcode = '23514';
  end if;

  select * into target
  from public.matches m
  where m.id = match_id
    and (m.guardian_id = actor or m.caregiver_id = actor);

  -- 없는 매칭과 남의 매칭을 구분해서 알려 주지 않는다
  if target.id is null then
    return null;
  end if;
  if target.status <> 'completed' then
    raise exception '끝난 간병에만 후기를 남길 수 있습니다.' using errcode = '22023';
  end if;

  reviewee := case when target.guardian_id = actor then target.caregiver_id else target.guardian_id end;

  insert into public.reviews (match_id, reviewer_id, reviewee_id, rating, comment)
  values (match_id, actor, reviewee, rating, nullif(trim(comment), ''))
  -- 이미 쓴 후기는 덮어쓰지 않는다. 앱은 null 을 받고 "이미 남기셨습니다"로 안내한다.
  on conflict (match_id, reviewer_id) do nothing
  returning id into review_id;

  return review_id;
end;
$$;

comment on function public.create_review(uuid, smallint, text) is '끝난 간병에 후기를 남긴다. 이미 남겼으면 null 을 돌려준다.';

revoke all on function public.create_review(uuid, smallint, text) from public, anon;
grant execute on function public.create_review(uuid, smallint, text) to authenticated;

-- 31) 추천 후보에 신뢰도 얹기 -------------------------------------------------
--
-- 보호자가 간병인을 고를 때 평균 별점은 경력만큼이나 중요한 근거다.
-- 반환 컬럼이 바뀌므로 create or replace 로는 안 되고 먼저 지워야 한다.
--
-- 점수 계산에는 아직 넣지 않는다. 별점을 배점에 섞으면 후기가 없는 새 간병인이
-- 계속 아래로 밀려 첫 매칭을 잡지 못한다. 화면에는 보여 주되 순위는 지금 규칙대로 둔다 —
-- 몇 건 이상부터 어떻게 반영할지는 후기가 쌓인 뒤에 정한다.

drop function if exists public.recommendation_candidates(uuid);

create or replace function public.recommendation_candidates(request_id uuid)
returns table (
  caregiver_id uuid,
  name text,
  gender text,
  years_of_experience smallint,
  certifications text[],
  skills text[],
  care_types text[],
  regions text[],
  min_daily_wage integer,
  introduction text,
  availability text[],
  rating_avg numeric,
  review_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  req public.care_requests%rowtype;
begin
  select * into req from public.care_requests r where r.id = request_id;

  if req.id is null or req.guardian_id <> (select auth.uid()) then
    return;
  end if;

  return query
  select
    p.id,
    public.mask_person_name(pr.name),
    p.gender,
    p.years_of_experience,
    p.certifications,
    p.skills,
    p.care_types,
    p.regions,
    p.min_daily_wage,
    p.introduction,
    coalesce(
      array_agg(a.weekday || ':' || a.slot) filter (where a.weekday is not null),
      '{}'
    ),
    ur.rating_avg,
    coalesce(ur.review_count, 0)
  from public.caregiver_profiles p
  join public.profiles pr on pr.id = p.id
  left join public.caregiver_availability a on a.caregiver_id = p.id
  -- 후기가 없는 간병인도 후보에서 빠지지 않는다 (left join)
  left join public.user_ratings ur on ur.user_id = p.id
  where
    req.care_type = any (p.care_types)
    and (req.preferred_caregiver_gender = 'any' or p.gender = req.preferred_caregiver_gender)
    and p.id is distinct from req.matched_caregiver_id
  group by p.id, pr.name, ur.rating_avg, ur.review_count
  order by p.years_of_experience desc, p.id
  limit 50;
end;
$$;

comment on function public.recommendation_candidates(uuid) is '요청의 추천 후보가 될 수 있는 간병인. 평균 별점을 함께 내보내되 점수는 매기지 않는다.';

revoke all on function public.recommendation_candidates(uuid) from public, anon;
grant execute on function public.recommendation_candidates(uuid) to authenticated;

-- 32) 아직 열지 않은 것 -------------------------------------------------------
--
--   후기 수정·삭제: 열지 않았다. 신뢰도로 남는 기록이라 조용히 바뀌면 안 된다.
--     신고와 운영자 삭제는 Phase 11(관리자)에서 별도 창구로 다룬다.
--   점수 반영: 별점을 매칭 점수에 넣을지, 넣는다면 몇 건부터 얼마나 반영할지는
--     후기가 쌓인 뒤에 정한다. 지금은 화면에 보여 주기만 한다.

-- ===========================================================================
-- Phase 9 — 교육 · 퀴즈 · 수료
-- ===========================================================================
--
-- 간병인이 교육 내용을 읽고 퀴즈를 풀어 수료를 남긴다.
--
--   training_courses 1 ──< training_lessons        (읽는 내용)
--                    1 ──< training_quiz_questions (푸는 문항 · 정답이 들어 있다)
--                    1 ──< training_quiz_attempts  (응시할 때마다 한 줄)
--                    1 ──< training_completions    (사람당 한 줄, 처음 합격한 날)
--
-- 두 가지가 이 절의 뼈대다.
--
-- 첫째, 정답은 앱으로 나가지 않는다. training_quiz_questions 에는 select 정책을
-- 아예 두지 않아서 그 표를 읽는 창구가 없고, 문항은 course_quiz() 가 정답과 해설을
-- 뺀 채로만 내보낸다.
--
-- 둘째, 채점과 수료 판정은 submit_quiz() 만 한다. 응시·수료 두 표에 insert 정책이
-- 없으므로 앱이 "몇 점 맞았고 수료했습니다"를 직접 적어 넣을 방법 자체가 없다.
-- 수료는 보호자가 간병인을 고를 때 근거로 쓰일 기록이라, 앱이 보낸 값을 믿으면
-- 그 기록 전체가 뜻을 잃는다.
--
-- 교육 내용을 앱 번들이 아니라 여기에 두는 이유는, 교육 자료가 앱 배포와 상관없이
-- 늘어나고 고쳐지는 것이기 때문이다. Mock 모드가 읽는 사본은 src/api/training.demo.ts 에
-- 있고 식별자를 맞춰 두었다 — 내용을 고칠 때는 두 곳을 함께 고친다.

-- 33) 교육 과정 ---------------------------------------------------------------

create table if not exists public.training_courses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text not null,

  -- 수료하면 프로필에 함께 보이는 자격 이름. 없는 과정도 있다.
  certification_label text,
  estimated_minutes smallint not null check (estimated_minutes > 0),

  -- 합격 기준. 맞힌 문항 비율(0~100)이 이 값 이상이면 수료한다.
  -- 과정마다 다르게 둔다 — 응급 처치와 위생 교육을 같은 잣대로 볼 이유가 없다.
  pass_score smallint not null default 80 check (pass_score between 50 and 100),

  display_order smallint not null default 0,

  -- 내용을 다듬는 동안 감춰 두기 위한 값. 내린 과정도 지우지 않는다 —
  -- 지우면 그 과정을 수료한 사람의 기록까지 함께 사라진다.
  is_published boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.training_courses is '간병인 교육 과정. 내용은 운영자가 심고 앱은 읽기만 한다.';
comment on column public.training_courses.pass_score is '합격 기준(맞힌 문항 비율 0~100). 과정마다 다르다.';
comment on column public.training_courses.is_published is '거짓이면 목록과 상세에서 보이지 않는다. 이미 수료한 기록은 그대로 남는다.';

drop trigger if exists training_courses_set_updated_at on public.training_courses;
create trigger training_courses_set_updated_at
  before update on public.training_courses
  for each row execute function public.set_updated_at();

alter table public.training_courses enable row level security;

-- 교육은 간병인 대상이지만 읽는 것까지 막지 않는다.
-- 보호자가 "간병인이 어떤 교육을 받는가"를 볼 수 있어도 잃는 것이 없고,
-- Phase 11 의 관리자도 같은 목록을 본다. 응시만 간병인으로 제한한다.
drop policy if exists "공개 교육 과정 조회" on public.training_courses;
create policy "공개 교육 과정 조회"
  on public.training_courses for select
  to authenticated
  using (is_published);

-- insert/update/delete 정책은 두지 않는다. 과정을 심고 고치는 일은 운영자가 SQL 로 한다.

-- 34) 교육 내용 ---------------------------------------------------------------

create table if not exists public.training_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses (id) on delete cascade,

  display_order smallint not null,
  title text not null,
  body text not null,

  -- 본문을 끝까지 읽지 못해도 남아야 하는 것들. 요약이 아니라 현장에서 손이 먼저 나가야 하는 항목이다.
  key_points text[] not null default '{}',

  created_at timestamptz not null default now(),

  constraint training_lessons_order_unique unique (course_id, display_order)
);

comment on table public.training_lessons is '교육 과정의 단원. 순서(display_order)대로 읽는다.';

alter table public.training_lessons enable row level security;

drop policy if exists "공개 과정 교육 내용 조회" on public.training_lessons;
create policy "공개 과정 교육 내용 조회"
  on public.training_lessons for select
  to authenticated
  using (
    exists (
      select 1 from public.training_courses c
      where c.id = course_id and c.is_published
    )
  );

-- 35) 퀴즈 문항 ---------------------------------------------------------------
--
-- 이 표에는 select 정책이 없다. 정답(answer_index)과 해설이 함께 들어 있어서,
-- 한 줄이라도 앱이 직접 읽을 수 있으면 수료의 뜻이 사라지기 때문이다.
-- 문항을 읽는 창구는 아래 course_quiz() 하나뿐이고, 그쪽은 정답을 빼고 내보낸다.

create table if not exists public.training_quiz_questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses (id) on delete cascade,

  display_order smallint not null,
  question text not null,

  -- 보기. 배열의 순서가 곧 보기 번호이며 번호는 1부터 센다.
  choices text[] not null check (array_length(choices, 1) between 2 and 6),

  -- 정답 보기의 번호(1부터). 보기 개수를 넘지 못한다.
  answer_index smallint not null check (answer_index >= 1),

  -- 왜 그 답인지. 맞힌 문항에도 보여 준다 — 찍어서 맞힌 것을 배운 것으로 두지 않는다.
  explanation text not null,

  created_at timestamptz not null default now(),

  constraint training_quiz_questions_order_unique unique (course_id, display_order),
  constraint training_quiz_questions_answer_in_range
    check (answer_index <= array_length(choices, 1))
);

comment on table public.training_quiz_questions is '퀴즈 문항과 정답. select 정책이 없어 앱은 이 표를 읽지 못한다 — 문항은 course_quiz() 로만 나간다.';
comment on column public.training_quiz_questions.answer_index is '정답 보기 번호(1부터). 앱으로 내보내지 않는다.';

alter table public.training_quiz_questions enable row level security;

-- 정책을 하나도 만들지 않는다. RLS 가 켜져 있고 정책이 없으면 아무도 읽을 수 없다.

-- 36) 공개 과정 목록 ----------------------------------------------------------
--
-- 문항 수를 과정 표에 적어 두지 않고 뷰가 그때그때 센다. 적어 두면 문항을 늘릴 때마다
-- 두 값을 함께 고쳐야 하고, 어긋난 문항 수는 아무도 바로 알아차리지 못한다 —
-- 평균 별점을 user_ratings 뷰가 세는 것과 같은 이유다.
--
-- 문항 표는 아무도 읽을 수 없으므로 이 뷰는 호출자 권한으로 돌지 않는다(security_invoker = false).
-- 개수만 세어 내보내며 문항이나 정답은 담기지 않는다.

create or replace view public.published_courses
with (security_invoker = false) as
select
  c.id,
  c.slug,
  c.title,
  c.summary,
  c.certification_label,
  c.estimated_minutes,
  c.pass_score,
  c.display_order,
  (
    select count(*)::integer
    from public.training_quiz_questions q
    where q.course_id = c.id
  ) as question_count
from public.training_courses c
where c.is_published;

comment on view public.published_courses is '공개된 교육 과정과 문항 수. 문항과 정답은 담기지 않아 누구에게나 열어도 된다.';

revoke all on public.published_courses from anon;
grant select on public.published_courses to authenticated;

-- 37) 퀴즈 문항 내보내기 ------------------------------------------------------
--
-- 정답(answer_index)과 해설은 빼고 보낸다. 해설은 채점 결과와 함께 돌려주므로
-- 문항을 받는 시점에는 필요하지 않고, 함께 보내면 정답이 그대로 드러난다.

create or replace function public.course_quiz(target_course uuid)
returns table (
  id uuid,
  display_order smallint,
  question text,
  choices text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select q.id, q.display_order, q.question, q.choices
  from public.training_quiz_questions q
  join public.training_courses c on c.id = q.course_id
  where q.course_id = target_course and c.is_published
  order by q.display_order;
$$;

comment on function public.course_quiz(uuid) is '이 과정의 퀴즈 문항. 정답과 해설은 내보내지 않는다.';

revoke all on function public.course_quiz(uuid) from public, anon;
grant execute on function public.course_quiz(uuid) to authenticated;

-- 38) 응시 기록 ---------------------------------------------------------------
--
-- 점수(0~100)만 남기지 않고 맞힌 개수와 그때의 문항 수를 함께 남긴다.
-- 나중에 문항이 늘거나 줄면 비율만으로는 그때 무엇을 풀었는지 되짚을 수 없다.

create table if not exists public.training_quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses (id) on delete cascade,
  caregiver_id uuid not null references public.profiles (id) on delete cascade,

  correct_count smallint not null check (correct_count >= 0),
  question_count smallint not null check (question_count > 0),
  score smallint not null check (score between 0 and 100),
  passed boolean not null,

  created_at timestamptz not null default now(),

  constraint training_quiz_attempts_count_in_range check (correct_count <= question_count)
);

comment on table public.training_quiz_attempts is '퀴즈 응시 한 번의 결과. 몇 번이든 쌓이며 지워지지 않는다.';

create index if not exists training_quiz_attempts_caregiver_idx
  on public.training_quiz_attempts (caregiver_id, created_at desc);

alter table public.training_quiz_attempts enable row level security;

drop policy if exists "본인 응시 기록 조회" on public.training_quiz_attempts;
create policy "본인 응시 기록 조회"
  on public.training_quiz_attempts for select
  to authenticated
  using ((select auth.uid()) = caregiver_id);

-- insert/update/delete 정책은 두지 않는다. 기록을 만드는 일은 submit_quiz() 만 한다.

-- 39) 수료 --------------------------------------------------------------------
--
-- 과정당 한 줄이다. 이미 수료한 과정을 다시 풀어 더 높은 점수를 받아도 줄이 늘지 않고
-- 날짜도 그대로다 — 수료는 "언제 이 교육을 마쳤는가"의 기록이라 나중 응시로 날짜가
-- 밀리면 이력으로서 뜻을 잃는다.

create table if not exists public.training_completions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses (id) on delete cascade,
  caregiver_id uuid not null references public.profiles (id) on delete cascade,

  -- 어느 응시로 수료했는지. 나중에 문항이 바뀌어도 그때 무엇을 풀었는지 되짚을 수 있다.
  attempt_id uuid not null references public.training_quiz_attempts (id) on delete cascade,

  completed_at timestamptz not null default now(),

  constraint training_completions_one_per_course unique (course_id, caregiver_id)
);

comment on table public.training_completions is '교육 수료. 사람마다 과정당 한 줄이며 날짜는 처음 합격한 날이다.';

create index if not exists training_completions_caregiver_idx
  on public.training_completions (caregiver_id, completed_at desc);

alter table public.training_completions enable row level security;

drop policy if exists "본인 수료 기록 조회" on public.training_completions;
create policy "본인 수료 기록 조회"
  on public.training_completions for select
  to authenticated
  using ((select auth.uid()) = caregiver_id);

-- insert/update/delete 정책은 두지 않는다. 수료를 만드는 일은 submit_quiz() 만 한다.

-- 40) 퀴즈 제출과 채점 --------------------------------------------------------
--
-- 앱은 고른 보기 번호만 보낸다. 점수도, 합격 여부도 보내지 않는다.
--
-- 채점은 앱이 보낸 답이 아니라 이 과정의 문항을 기준으로 돈다. 없는 문항의 답이
-- 섞여 있어도 세지 않고, 빠진 문항은 틀린 것으로 센다 — 답을 적게 보내서 분모를
-- 줄이는 일이 없어야 한다.
--
-- 결과와 응시 기록을 한 번에 돌려준다. 나눠서 부르면 채점과 조회 사이에 다른 응시가
-- 끼어들 수 있고, 화면은 방금 낸 그 답의 결과를 보여 줘야 한다.

create or replace function public.submit_quiz(target_course uuid, submitted_answers jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.training_courses%rowtype;
  graded jsonb;
  total smallint;
  correct smallint;
  final_score smallint;
  did_pass boolean;
  new_attempt public.training_quiz_attempts%rowtype;
  new_completion public.training_completions%rowtype;
  earlier public.training_completions%rowtype;
begin
  if not public.is_caregiver() then
    raise exception '간병인만 교육 퀴즈를 풀 수 있습니다.' using errcode = '22023';
  end if;

  select * into target
  from public.training_courses c
  where c.id = target_course and c.is_published;

  -- 없는 과정과 내려간 과정을 구분해서 알려 주지 않는다
  if target.id is null then
    return null;
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'question_id', q.id,
          'selected_index', chosen.choice_index,
          'answer_index', q.answer_index,
          'is_correct', chosen.choice_index is not distinct from q.answer_index,
          'explanation', q.explanation
        )
        order by q.display_order
      ),
      '[]'::jsonb
    ),
    (count(*))::smallint,
    (count(*) filter (where chosen.choice_index is not distinct from q.answer_index))::smallint
  into graded, total, correct
  from public.training_quiz_questions q
  -- 문항 하나에 답 하나. 같은 문항의 답이 여러 번 들어와도 먼저 온 것만 본다
  -- (with ordinality 로 배열 순서를 되살려서 "먼저"를 분명히 정한다).
  -- 식별자를 uuid 로 바꾸지 않고 문자열끼리 맞춰 본다. 앱이 uuid 가 아닌 값을 보내도
  -- 그 답이 어느 문항에도 걸리지 않을 뿐, 채점 자체가 오류로 끝나지는 않는다.
  left join lateral (
    select (answer.item ->> 'choice_index')::smallint as choice_index
    from jsonb_array_elements(submitted_answers) with ordinality as answer(item, idx)
    where answer.item ->> 'question_id' = q.id::text
    order by answer.idx
    limit 1
  ) chosen on true
  where q.course_id = target.id;

  if total = 0 then
    raise exception '이 과정에는 아직 퀴즈가 없습니다.' using errcode = '22023';
  end if;

  -- 앱의 src/lib/training.ts 가 Mock 모드에서 같은 식으로 센다
  final_score := round(correct * 100.0 / total);
  did_pass := final_score >= target.pass_score;

  insert into public.training_quiz_attempts
    (course_id, caregiver_id, correct_count, question_count, score, passed)
  values (target.id, actor, correct, total, final_score, did_pass)
  returning * into new_attempt;

  if did_pass then
    insert into public.training_completions (course_id, caregiver_id, attempt_id)
    values (target.id, actor, new_attempt.id)
    -- 이미 수료한 과정은 덮어쓰지 않는다. 수료일은 처음 합격한 날 그대로다.
    on conflict (course_id, caregiver_id) do nothing
    returning * into new_completion;

    if new_completion.id is null then
      select * into earlier
      from public.training_completions tc
      where tc.course_id = target.id and tc.caregiver_id = actor;
    end if;
  end if;

  return jsonb_build_object(
    'attempt', to_jsonb(new_attempt),
    'results', graded,
    'is_new_completion', new_completion.id is not null,
    'completed_at', coalesce(new_completion.completed_at, earlier.completed_at)
  );
end;
$$;

comment on function public.submit_quiz(uuid, jsonb) is '퀴즈를 채점하고 붙었으면 수료를 남긴다. 점수와 합격 여부는 앱이 아니라 이 함수가 정한다.';

revoke all on function public.submit_quiz(uuid, jsonb) from public, anon;
grant execute on function public.submit_quiz(uuid, jsonb) to authenticated;

-- 41) 교육 과정 심기 ----------------------------------------------------------
--
-- 여러 번 실행해도 안전하다. 식별자가 같으면 내용을 덮어쓰므로 문장을 다듬은 뒤
-- 이 절만 다시 돌려도 된다. 식별자를 바꾸면 그 과정을 수료한 기록이 과정을 잃으므로
-- 내용을 고칠 때 식별자는 그대로 둔다.
--
-- 같은 내용이 Mock 모드용으로 src/api/training.demo.ts 에도 있다. 두 곳을 함께 고친다.

insert into public.training_courses
  (id, slug, title, summary, certification_label, estimated_minutes, pass_score, display_order)
values
  (
    '00000009-0001-4000-8000-000000000001',
    'dementia-care',
    '치매 어르신 돌봄 기초',
    '기억이 흐려진 어르신과 어떻게 이야기하고, 반복되는 질문과 화를 어떻게 받아야 하는지 배웁니다.',
    '치매전문교육 이수',
    25, 80, 1
  ),
  (
    '00000009-0001-4000-8000-000000000002',
    'emergency-response',
    '응급 상황 대처와 심폐소생술',
    '쓰러지심, 숨 막히심, 낙상처럼 몇 분이 갈리는 상황에서 먼저 무엇을 할지 몸에 익힙니다.',
    '심폐소생술(CPR) 교육 이수',
    20, 80, 2
  ),
  (
    '00000009-0001-4000-8000-000000000003',
    'infection-and-transfer',
    '감염 예방과 안전한 이동 돕기',
    '손 위생과 욕창 예방, 그리고 어르신과 간병인 모두 다치지 않는 부축·이동 방법을 익힙니다.',
    null,
    15, 70, 3
  )
on conflict (id) do update set
  slug = excluded.slug,
  title = excluded.title,
  summary = excluded.summary,
  certification_label = excluded.certification_label,
  estimated_minutes = excluded.estimated_minutes,
  pass_score = excluded.pass_score,
  display_order = excluded.display_order;

insert into public.training_lessons (id, course_id, display_order, title, body, key_points)
values
  (
    '00000009-0002-4000-8000-000000010001',
    '00000009-0001-4000-8000-000000000001',
    1,
    '치매는 고집이 아니라 병입니다',
    e'같은 것을 몇 번이고 묻고, 방금 드신 식사를 안 먹었다고 하시고, 아끼던 물건을 누가 가져갔다고 하십니다. 이것은 어르신이 고집을 부리거나 우리를 시험하는 것이 아니라 병의 증상입니다.\n\n기억은 최근 것부터 사라집니다. 그래서 어르신에게는 오늘 아침이 없고 30년 전이 지금입니다. "아까 말씀드렸잖아요"라고 바로잡으면 어르신은 자기가 틀렸다는 사실만 남고 왜 틀렸는지는 남지 않습니다. 남는 것은 무안함과 두려움뿐입니다.\n\n돌봄의 목표는 어르신을 현실로 데려오는 것이 아니라, 어르신이 있는 자리에서 편안하시게 하는 것입니다.',
    array[
      '반복되는 질문은 증상이지 고집이 아닙니다',
      '틀린 말을 바로잡기보다 그 순간의 감정을 먼저 받습니다',
      '어르신을 현실로 끌어오려 하지 않습니다'
    ]
  ),
  (
    '00000009-0002-4000-8000-000000010002',
    '00000009-0001-4000-8000-000000000001',
    2,
    '말을 거는 방법',
    e'앞에서, 눈높이를 맞추고, 천천히 말합니다. 뒤에서 갑자기 말을 걸거나 팔을 잡으면 놀라서 밀치실 수 있습니다. 이때의 저항은 공격이 아니라 방어입니다.\n\n한 번에 하나만 묻습니다. "식사하시고 약 드신 다음에 산책 나가실래요?"는 세 가지 질문입니다. "식사하실까요?"로 충분합니다. 선택지도 둘까지만 드립니다.\n\n말이 막히실 때는 기다립니다. 대신 말해 드리면 대화는 빨라지지만 어르신은 말할 기회를 잃습니다.',
    array[
      '앞에서 눈높이를 맞추고 천천히 말합니다',
      '한 번에 한 가지만, 선택지는 둘까지',
      '뒤에서 갑자기 다가가거나 팔을 잡지 않습니다'
    ]
  ),
  (
    '00000009-0002-4000-8000-000000010003',
    '00000009-0001-4000-8000-000000000001',
    3,
    '화를 내실 때',
    e'치매 어르신이 갑자기 화를 내실 때는 대개 이유가 있습니다. 아프시거나, 화장실이 급하시거나, 배가 고프시거나, 낯선 곳에서 무섭거나 합니다. 말로 설명하지 못하시니 화로 나옵니다.\n\n먼저 안전한 거리를 두고 목소리를 낮춥니다. 맞서 설명하거나 설득하지 않습니다. 그 순간의 감정을 그대로 받아 드리고("놀라셨겠어요"), 화제를 다른 곳으로 옮기거나 자리를 바꿔 드립니다.\n\n진정되신 뒤에는 무슨 일이 있었는지 보호자에게 알립니다. 반복되는 상황에는 대개 반복되는 원인이 있고, 그 기록이 다음번을 막습니다.',
    array[
      '갑작스러운 화는 통증·배뇨·공포 같은 다른 신호일 수 있습니다',
      '맞서 설득하지 말고 감정을 받은 뒤 상황을 바꿉니다',
      '있었던 일은 보호자에게 알려 기록으로 남깁니다'
    ]
  ),
  (
    '00000009-0002-4000-8000-000000020001',
    '00000009-0001-4000-8000-000000000002',
    1,
    '쓰러지셨을 때의 순서',
    e'어깨를 가볍게 두드리며 큰 소리로 불러 반응을 봅니다. 반응이 없으면 곧바로 119에 신고합니다. 혼자 있다면 스피커폰으로 바꿔 두고 두 손을 씁니다.\n\n다음으로 숨을 쉬는지 10초 안에 봅니다. 가슴이 오르내리지 않거나 헐떡이는 듯한 숨만 있으면 숨을 쉬지 않는 것으로 봅니다.\n\n신고보다 앞서는 것은 없습니다. 보호자에게 먼저 전화하다 5분을 보내면 그 5분은 되찾을 수 없습니다. 보호자 연락은 119에 신고한 다음입니다.',
    array[
      '반응 확인 → 119 신고 → 호흡 확인 순서로 합니다',
      '보호자보다 119가 먼저입니다',
      '헐떡이는 숨은 정상 호흡이 아닙니다'
    ]
  ),
  (
    '00000009-0002-4000-8000-000000020002',
    '00000009-0001-4000-8000-000000000002',
    2,
    '가슴압박',
    e'단단한 바닥에 눕히고 가슴 한가운데(복장뼈 아래쪽 절반)에 손꿈치를 댑니다. 두 손을 겹치고 팔을 곧게 편 채 체중으로 누릅니다.\n\n어른 기준으로 약 5cm 깊이, 1분에 100~120회 속도입니다. 누른 뒤에는 가슴이 완전히 올라오도록 힘을 뺍니다. 덜 올라오면 심장이 다시 채워지지 않습니다.\n\n인공호흡에 자신이 없으면 가슴압박만 계속해도 됩니다. 구급대가 올 때까지, 또는 어르신이 스스로 숨을 쉬실 때까지 멈추지 않습니다.',
    array[
      '가슴 한가운데를 약 5cm 깊이로, 1분에 100~120회',
      '누른 뒤 가슴이 완전히 올라오게 힘을 뺍니다',
      '자신이 없으면 가슴압박만 해도 됩니다'
    ]
  ),
  (
    '00000009-0002-4000-8000-000000020003',
    '00000009-0001-4000-8000-000000000002',
    3,
    '기도막힘과 낙상',
    e'식사 중 갑자기 말을 못 하시고 목을 감싸 쥐시면 기도막힘입니다. 기침을 하실 수 있으면 계속 기침하시게 두고, 소리도 내지 못하시면 등을 세게 두드린 뒤 복부 밀어내기를 번갈아 합니다.\n\n낙상은 일으켜 세우는 것이 먼저가 아닙니다. 머리를 부딪치셨는지, 어느 곳이 아프신지, 팔다리를 움직이실 수 있는지 먼저 확인합니다. 골절이나 척추 손상이 있는 상태에서 일으키면 손상이 커집니다.\n\n어느 경우든 있었던 일은 시각과 함께 보호자에게 알립니다.',
    array[
      '기침을 하실 수 있으면 기침을 막지 않습니다',
      '낙상 후에는 일으키기 전에 통증과 움직임을 먼저 확인합니다',
      '있었던 일은 시각과 함께 보호자에게 알립니다'
    ]
  ),
  (
    '00000009-0002-4000-8000-000000030001',
    '00000009-0001-4000-8000-000000000003',
    1,
    '손 위생이 먼저입니다',
    e'간병에서 감염을 막는 가장 확실한 방법은 손 씻기입니다. 어르신을 만지기 전과 후, 기저귀나 상처를 다룬 뒤, 식사를 돕기 전에 씻습니다.\n\n비누로 30초입니다. 손가락 사이, 손톱 밑, 손목까지 닿아야 합니다. 물과 비누가 없을 때는 손 소독제를 쓰되, 눈에 보이게 더러워졌거나 설사·구토를 다룬 뒤에는 반드시 비누로 씻습니다.\n\n장갑은 손 씻기를 대신하지 않습니다. 장갑을 벗은 뒤에도 손은 씻습니다.',
    array[
      '어르신을 만지기 전후, 기저귀·상처를 다룬 뒤에는 반드시 씻습니다',
      '비누로 30초, 손가락 사이와 손목까지',
      '장갑은 손 씻기를 대신하지 않습니다'
    ]
  ),
  (
    '00000009-0002-4000-8000-000000030002',
    '00000009-0001-4000-8000-000000000003',
    2,
    '욕창은 생기기 전에 막습니다',
    e'누워 지내시는 어르신은 같은 자리가 눌린 채로 있으면 피가 돌지 않아 살이 상합니다. 꼬리뼈, 발뒤꿈치, 어깨뼈, 귀 뒤가 잘 생기는 자리입니다.\n\n2시간마다 체위를 바꿔 드리는 것이 기본입니다. 피부가 붉어졌다가 손을 떼고 30분이 지나도 돌아오지 않으면 이미 욕창의 시작입니다.\n\n젖은 상태가 가장 위험합니다. 땀이나 소변으로 축축해지면 바로 갈아 드리고 잘 말립니다. 다만 붉어진 자리를 문지르지는 않습니다 — 문지르면 상한 조직이 더 벌어집니다.',
    array[
      '2시간마다 체위를 바꿔 드립니다',
      '붉은 자국이 30분 넘게 남으면 욕창의 시작입니다',
      '축축한 상태를 오래 두지 말고, 붉어진 자리는 문지르지 않습니다'
    ]
  ),
  (
    '00000009-0002-4000-8000-000000030003',
    '00000009-0001-4000-8000-000000000003',
    3,
    '나도 다치지 않는 이동 돕기',
    e'허리로 들면 간병인이 먼저 다칩니다. 발을 어깨너비로 벌리고 무릎을 굽혀 다리 힘으로 일으킵니다. 허리는 굽히지 않고 세운 채로 둡니다.\n\n어르신을 최대한 몸 가까이 붙여서 옮깁니다. 팔을 뻗어 멀리서 당기면 힘은 몇 배로 들고 어깨가 상합니다. 겨드랑이를 잡아 끌어올리는 것도 어깨 탈구의 흔한 원인이라 하지 않습니다.\n\n혼자 감당하기 어려우면 혼자 하지 않습니다. 이동보조기구를 쓰거나 사람을 부르는 것이 두 사람 모두를 지킵니다.',
    array[
      '허리가 아니라 무릎과 다리 힘으로 일으킵니다',
      '어르신을 몸 가까이 붙여서 옮깁니다',
      '겨드랑이를 잡아 끌어올리지 않습니다'
    ]
  )
on conflict (id) do update set
  course_id = excluded.course_id,
  display_order = excluded.display_order,
  title = excluded.title,
  body = excluded.body,
  key_points = excluded.key_points;

insert into public.training_quiz_questions
  (id, course_id, display_order, question, choices, answer_index, explanation)
values
  (
    '00000009-0003-4000-8000-000000010001',
    '00000009-0001-4000-8000-000000000001',
    1,
    '어르신이 방금 드신 점심을 안 먹었다고 하십니다. 어떻게 하는 것이 좋습니까?',
    array[
      '드셨다는 것을 분명히 알려 드리고 넘어간다',
      '시장하시겠다고 받아 드린 뒤 가벼운 간식을 드리며 화제를 옮긴다',
      '식사한 그릇을 보여 드리며 확인시켜 드린다',
      '보호자에게 전화해 어르신께 직접 말씀드리게 한다'
    ],
    2,
    '기억을 바로잡아도 어르신께는 틀렸다는 사실만 남습니다. 감정을 먼저 받아 드리고 자연스럽게 상황을 바꾸는 편이 낫습니다.'
  ),
  (
    '00000009-0003-4000-8000-000000010002',
    '00000009-0001-4000-8000-000000000001',
    2,
    '치매 어르신에게 말을 걸 때 맞는 방법은 무엇입니까?',
    array[
      '뒤에서 어깨를 짚어 주의를 끈 뒤 말한다',
      '한 번에 여러 선택지를 드려 고르시게 한다',
      '앞에서 눈높이를 맞추고 한 번에 한 가지만 천천히 묻는다',
      '말이 막히시면 대신 말씀해 드려 대화를 이어 간다'
    ],
    3,
    '앞에서, 눈높이를 맞추고, 한 번에 하나만 묻습니다. 뒤에서 다가가면 놀라서 방어 반응이 나올 수 있습니다.'
  ),
  (
    '00000009-0003-4000-8000-000000010003',
    '00000009-0001-4000-8000-000000000001',
    3,
    '어르신이 갑자기 큰 소리를 내며 화를 내십니다. 가장 먼저 살펴야 할 것은 무엇입니까?',
    array[
      '어디가 아프시거나 화장실이 급하신지 같은 몸의 신호',
      '누가 잘못했는지 상황의 앞뒤',
      '어르신이 오늘 약을 잘 드셨는지 보호자에게 확인',
      '조용해지실 때까지 방에서 나와 기다린다'
    ],
    1,
    '갑작스러운 화는 통증, 배뇨, 배고픔, 공포처럼 말로 표현하지 못한 다른 신호인 경우가 많습니다. 원인을 먼저 봅니다.'
  ),
  (
    '00000009-0003-4000-8000-000000010004',
    '00000009-0001-4000-8000-000000000001',
    4,
    '치매 어르신의 기억에 대해 맞는 설명은 무엇입니까?',
    array[
      '오래된 기억부터 순서대로 사라진다',
      '최근 기억부터 흐려지고 오래된 기억이 더 오래 남는다',
      '기억은 남아 있고 말만 나오지 않는 것이다',
      '규칙적으로 물어보면 기억이 되살아난다'
    ],
    2,
    '최근 기억부터 사라집니다. 어르신에게 30년 전이 지금처럼 느껴지는 것은 그 때문입니다.'
  ),
  (
    '00000009-0003-4000-8000-000000010005',
    '00000009-0001-4000-8000-000000000001',
    5,
    '어르신이 진정되신 뒤 간병인이 해야 할 일은 무엇입니까?',
    array[
      '어르신께 아까 왜 그러셨는지 여쭤 본다',
      '다음에 또 그러시면 안 된다고 약속을 받는다',
      '있었던 일과 그때의 상황을 보호자에게 알린다',
      '별일 아니므로 따로 알리지 않는다'
    ],
    3,
    '반복되는 상황에는 반복되는 원인이 있습니다. 그 기록이 쌓여야 다음번을 막을 수 있습니다.'
  ),
  (
    '00000009-0003-4000-8000-000000020001',
    '00000009-0001-4000-8000-000000000002',
    1,
    '어르신이 쓰러져 반응이 없습니다. 가장 먼저 할 일은 무엇입니까?',
    array[
      '보호자에게 전화해 상황을 알린다',
      '119에 신고한다',
      '물을 조금 드려 정신을 차리게 한다',
      '침대로 옮겨 눕힌다'
    ],
    2,
    '반응이 없으면 곧바로 119입니다. 보호자 연락은 그다음입니다 — 먼저 전화하다 보낸 몇 분은 되찾을 수 없습니다.'
  ),
  (
    '00000009-0003-4000-8000-000000020002',
    '00000009-0001-4000-8000-000000000002',
    2,
    '어른에게 하는 가슴압박의 깊이와 속도로 맞는 것은 무엇입니까?',
    array[
      '약 2cm 깊이로 1분에 60회',
      '약 5cm 깊이로 1분에 100~120회',
      '약 8cm 깊이로 1분에 140회',
      '깊이는 상관없고 빠르기만 하면 된다'
    ],
    2,
    '어른 기준 약 5cm 깊이, 1분에 100~120회입니다.'
  ),
  (
    '00000009-0003-4000-8000-000000020003',
    '00000009-0001-4000-8000-000000000002',
    3,
    '가슴압박을 할 때 흔히 놓치는 것은 무엇입니까?',
    array[
      '누른 뒤 가슴이 완전히 올라오도록 힘을 빼는 것',
      '두 손을 나란히 놓는 것',
      '팔꿈치를 굽혀 힘을 조절하는 것',
      '푹신한 침대 위에서 하는 것'
    ],
    1,
    '누른 뒤 가슴이 완전히 올라와야 심장이 다시 채워집니다. 또 압박은 단단한 바닥에서 해야 합니다.'
  ),
  (
    '00000009-0003-4000-8000-000000020004',
    '00000009-0001-4000-8000-000000000002',
    4,
    '식사 중 어르신이 목을 감싸 쥐고 기침을 세게 하고 계십니다. 어떻게 해야 합니까?',
    array[
      '즉시 등을 두드리고 복부 밀어내기를 시작한다',
      '물을 마시게 해 음식을 넘기게 한다',
      '기침을 계속하시게 두고 곁에서 지켜본다',
      '입에 손을 넣어 음식을 꺼낸다'
    ],
    3,
    '기침을 하실 수 있다는 것은 기도가 완전히 막히지 않았다는 뜻입니다. 기침이 가장 효과적이므로 막지 않습니다. 소리조차 못 내실 때 등 두드리기와 복부 밀어내기를 합니다.'
  ),
  (
    '00000009-0003-4000-8000-000000020005',
    '00000009-0001-4000-8000-000000000002',
    5,
    '어르신이 화장실에서 넘어지셨습니다. 무엇을 먼저 해야 합니까?',
    array[
      '얼른 부축해 일으켜 침대로 모신다',
      '아픈 곳과 팔다리를 움직이실 수 있는지 먼저 확인한다',
      '넘어진 자리를 정리하고 사진을 찍는다',
      '괜찮다고 하시면 그대로 둔다'
    ],
    2,
    '골절이나 척추 손상이 있는 상태에서 일으키면 손상이 커집니다. 통증과 움직임을 먼저 확인합니다.'
  ),
  (
    '00000009-0003-4000-8000-000000030001',
    '00000009-0001-4000-8000-000000000003',
    1,
    '손을 씻어야 하는 때로 알맞지 않은 것은 무엇입니까?',
    array[
      '어르신을 만지기 전',
      '기저귀를 갈아 드린 뒤',
      '장갑을 벗은 뒤',
      '장갑을 끼고 있으면 씻지 않아도 된다'
    ],
    4,
    '장갑은 손 씻기를 대신하지 않습니다. 장갑을 벗은 뒤에도 손은 씻습니다.'
  ),
  (
    '00000009-0003-4000-8000-000000030002',
    '00000009-0001-4000-8000-000000000003',
    2,
    '누워 지내시는 어르신의 체위는 얼마마다 바꿔 드리는 것이 기본입니까?',
    array['30분마다', '2시간마다', '6시간마다', '하루 한 번'],
    2,
    '2시간마다가 기본입니다. 같은 자리가 오래 눌리면 피가 돌지 않아 욕창이 생깁니다.'
  ),
  (
    '00000009-0003-4000-8000-000000030003',
    '00000009-0001-4000-8000-000000000003',
    3,
    '꼬리뼈 부위가 붉어졌고 손을 떼고 30분이 지나도 돌아오지 않습니다. 어떻게 봐야 합니까?',
    array[
      '눌린 자국이므로 그대로 두면 된다',
      '욕창이 시작된 것으로 보고 눌리지 않게 하며 보호자에게 알린다',
      '붉은 자리를 문질러 피가 돌게 한다',
      '파우더를 뿌려 말린다'
    ],
    2,
    '30분이 지나도 남는 붉은 자국은 욕창의 시작입니다. 문지르면 상한 조직이 더 벌어지므로 문지르지 않습니다.'
  ),
  (
    '00000009-0003-4000-8000-000000030004',
    '00000009-0001-4000-8000-000000000003',
    4,
    '어르신을 침대에서 일으켜 드릴 때 맞는 자세는 무엇입니까?',
    array[
      '허리를 굽혀 상체 힘으로 들어 올린다',
      '겨드랑이를 잡고 끌어올린다',
      '무릎을 굽혀 다리 힘으로 일으키고 어르신을 몸 가까이 붙인다',
      '팔을 멀리 뻗어 한 번에 당긴다'
    ],
    3,
    '허리로 들면 간병인이 먼저 다칩니다. 무릎을 굽혀 다리 힘을 쓰고, 어르신을 몸 가까이 붙여 옮깁니다.'
  ),
  (
    '00000009-0003-4000-8000-000000030005',
    '00000009-0001-4000-8000-000000000003',
    5,
    '혼자 옮기기 어려운 어르신을 이동해야 할 때 알맞은 것은 무엇입니까?',
    array[
      '힘들어도 혼자 해내는 것이 간병인의 역할이다',
      '보조기구를 쓰거나 사람을 부른다',
      '어르신께 힘을 더 쓰시라고 부탁한다',
      '한 번에 빠르게 옮겨 시간을 줄인다'
    ],
    2,
    '혼자 감당하기 어려우면 혼자 하지 않습니다. 보조기구와 사람을 쓰는 것이 어르신과 간병인 모두를 지킵니다.'
  )
on conflict (id) do update set
  course_id = excluded.course_id,
  display_order = excluded.display_order,
  question = excluded.question,
  choices = excluded.choices,
  answer_index = excluded.answer_index,
  explanation = excluded.explanation;

-- 42) 아직 열지 않은 것 -------------------------------------------------------
--
--   수료를 보호자에게 보여 주기: 지금은 간병인 본인만 자기 수료를 본다.
--     추천 후보(recommendation_candidates)에 수료를 얹으면 보호자가 "확인된 교육"을
--     근거로 간병인을 고를 수 있다. 반환 컬럼이 바뀌는 일이라 Phase 11 에서 함께 연다.
--   매칭 점수 반영: 넣지 않았다. 별점과 같은 이유다 — 교육을 아직 못 들은 새 간병인이
--     계속 아래로 밀리면 첫 매칭을 잡지 못한다. 몇 개부터 얼마나 반영할지는
--     수료가 쌓인 뒤에 정한다.
--   응시 횟수 제한: 두지 않았다. 이 퀴즈는 걸러내기 위한 시험이 아니라 배우게 하려는
--     것이고, 틀린 문항은 해설과 함께 돌려주므로 다시 푸는 것 자체가 교육이다.
--   과정 관리 화면: 과정을 심고 고치는 일은 아직 SQL 로 한다. 운영자 화면은 Phase 11 이다.

-- ===========================================================================
-- Phase 10 — 노쇼와 대체 간병인
-- ===========================================================================
--
-- 수락해 놓고 오지 않는 일이 있다. 그것은 취소와 다르다 —
-- 취소는 못 오게 되었다고 알린 것이고, 노쇼는 알리지 않은 것이다.
--
-- 그래서 취소 기록에서 노쇼를 추론하지 않는다. 시작일이 지난 취소를 노쇼로 세면,
-- 하루 전에 연락하고 그만둔 사람과 말없이 오지 않은 사람이 같은 기록을 갖게 된다.
-- 노쇼는 보호자가 직접 신고할 때만 남는다.
--
-- 신고하면 요청은 곧바로 다시 대기중(pending)이 된다. care_requests.status 에 있는
-- no_show 값은 쓰지 않는다 — 요청을 그 상태에 두면 어느 간병인도 볼 수 없어서,
-- 사람이 가장 급한 순간에 요청이 잠긴다. 노쇼는 요청이 아니라 매칭에 붙는 사실이고,
-- 무슨 일이 있었는지는 matches 이력에 남는다.
--
-- 대신 두 곳에서 그 간병인을 뺀다.
--   accept_care_request()        — 다시 수락할 수 없다
--   recommendation_candidates()  — 이 요청의 추천 목록에 나오지 않는다
-- 다른 요청에서는 그대로 후보가 된다. 노쇼 한 번으로 일을 못 하게 막지는 않는다.

-- 43) 매칭에 노쇼 남기기 ------------------------------------------------------
--
-- 취소와 나란히 두지 않고 상태를 따로 둔다. 배지 색과 문구가 달라야 하고,
-- 무엇보다 "그만둔 사람"과 "오지 않은 사람"을 한 값으로 묶으면 나중에 갈라낼 수 없다.

alter table public.matches
  add column if not exists no_show_at timestamptz;

alter table public.matches
  add column if not exists no_show_reported_by uuid references public.profiles (id) on delete set null;

alter table public.matches
  add column if not exists no_show_note text;

comment on column public.matches.no_show_at is '간병인이 오지 않은 것으로 신고된 시각.';
comment on column public.matches.no_show_reported_by is '신고한 사람. 언제나 그 매칭의 보호자다.';

-- 상태 값이 늘었으므로 제약을 다시 건다 (check 제약은 값을 덧붙일 수 없다)
alter table public.matches
  drop constraint if exists matches_status_check;
alter table public.matches
  add constraint matches_status_check
    check (status in ('accepted', 'in_progress', 'completed', 'cancelled', 'no_show'));

alter table public.matches
  drop constraint if exists matches_status_time_valid;
alter table public.matches
  add constraint matches_status_time_valid check (
    (status <> 'in_progress' or started_at is not null)
    and (status <> 'completed' or completed_at is not null)
    and (status <> 'cancelled' or cancelled_at is not null)
    and (status <> 'no_show' or no_show_at is not null)
    and (cancelled_at is null) = (cancelled_by is null)
    and (no_show_at is null) = (no_show_reported_by is null)
    -- 노쇼는 시작되지 않은 간병에만 붙는다. 와서 하다가 끊긴 것은 취소다.
    and (status <> 'no_show' or started_at is null)
  );

comment on column public.matches.status is 'accepted 수락됨 / in_progress 간병중 / completed 종료 / cancelled 취소 / no_show 오지 않음';

-- 살아 있는 매칭을 요청당 하나로 묶는 matches_live_per_request_idx 는 그대로 둔다.
-- no_show 는 살아 있는 상태가 아니므로, 신고된 매칭이 남아 있어도 새 간병인이 수락할 수 있다.

-- 이 요청에서 오지 않았던 사람을 찾는 조회에 쓴다 (수락과 추천 양쪽에서 부른다)
create index if not exists matches_no_show_idx
  on public.matches (request_id, caregiver_id)
  where status = 'no_show';

-- 44) 노쇼 신고 ---------------------------------------------------------------
--
-- 보호자만 신고할 수 있다. 간병인이 자기 결석을 신고할 일은 없고, 오지 않았다는 것을
-- 아는 사람은 그 자리에 있던 보호자뿐이다.
--
-- 시작일 당일부터 신고할 수 있다. 시작일이 완전히 지나야만 신고할 수 있게 하면,
-- 오늘 오기로 한 간병인이 오지 않은 그날 — 대체 간병인이 가장 급한 날 — 에는
-- 아무것도 할 수 없다. 아직 오지 않은 날짜를 미리 신고하는 것만 막는다.
--
-- 날짜 비교는 한국 시간 기준으로 한다. start_date 는 보호자가 한국에서 고른 날짜인데
-- 서버의 UTC 자정으로 견주면 한국 시각 오전 9시 전까지는 "아직 오지 않은 날"이 된다.

create or replace function public.report_no_show(match_id uuid, note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  target public.matches%rowtype;
  starts_on date;
begin
  select * into target
  from public.matches m
  where m.id = match_id
    and m.guardian_id = actor
    and m.status = 'accepted';

  -- 없는 매칭, 남의 매칭, 이미 시작했거나 끝난 매칭을 구분해서 알려 주지 않는다
  if target.id is null then
    return null;
  end if;

  select r.start_date into starts_on
  from public.care_requests r
  where r.id = target.request_id;

  if starts_on is null or starts_on > (now() at time zone 'Asia/Seoul')::date then
    raise exception '간병 시작일이 지나야 신고할 수 있습니다.' using errcode = '22023';
  end if;

  update public.matches m
     set status = 'no_show',
         no_show_at = now(),
         no_show_reported_by = actor,
         no_show_note = nullif(trim(note), '')
   where m.id = target.id;

  -- 요청은 곧바로 다시 대기중이 된다. 시작 전 취소와 같은 처리이며,
  -- matched_caregiver_id 를 반드시 비운다 — 비우지 않으면
  -- care_requests_matched_state_valid 제약에 걸린다.
  update public.care_requests r
     set status = 'pending',
         matched_caregiver_id = null,
         matched_at = null
   where r.id = target.request_id;

  return target.id;
end;
$$;

comment on function public.report_no_show(uuid, text) is '간병인이 오지 않았다고 보호자가 신고한다. 요청은 곧바로 다시 대기중이 된다.';

revoke all on function public.report_no_show(uuid, text) from public, anon;
grant execute on function public.report_no_show(uuid, text) to authenticated;

-- 45) 오지 않았던 간병인은 같은 요청을 다시 가져갈 수 없다 --------------------
--
-- 신고와 동시에 요청이 다시 열리므로, 막지 않으면 그 간병인이 목록에서 같은 요청을
-- 그대로 다시 수락할 수 있다. 보호자는 같은 일을 한 번 더 겪게 된다.
--
-- 매칭 행을 만드는 부분은 Phase 7 과 같다. 조건 한 줄만 늘었다.

create or replace function public.accept_care_request(request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caregiver uuid := (select auth.uid());
  accepted public.care_requests%rowtype;
begin
  if caregiver is null or not public.is_caregiver() then
    raise exception '간병인만 요청을 수락할 수 있습니다.' using errcode = '42501';
  end if;

  -- 이 요청에서 오지 않았던 사람인지 먼저 본다.
  -- 요청을 바꾼 뒤에 확인하면 이미 가져간 뒤가 된다.
  --
  -- matches 에는 request_id 컬럼이 있어서 인자 이름과 겹친다. 그대로 두면 plpgsql 이
  -- 어느 쪽인지 가리지 못해 거부하므로 함수 이름으로 인자를 가리킨다.
  if exists (
    select 1 from public.matches m
    where m.request_id = accept_care_request.request_id
      and m.caregiver_id = caregiver
      and m.status = 'no_show'
  ) then
    raise exception '이 요청에서 오지 않으신 것으로 신고되어 다시 수락하실 수 없습니다.'
      using errcode = '22023';
  end if;

  update public.care_requests r
     set status = 'matched',
         matched_caregiver_id = caregiver,
         matched_at = now()
   where r.id = accept_care_request.request_id
     and r.status = 'pending'
  returning * into accepted;

  -- 없는 요청과 이미 넘어간 요청을 구분하지 않는다 — 구분해서 알려 주면
  -- 아무 uuid나 넣어 보며 요청의 존재 여부를 알아낼 수 있다.
  if accepted.id is null then
    return null;
  end if;

  insert into public.matches (request_id, guardian_id, caregiver_id, status, accepted_at)
  values (accepted.id, accepted.guardian_id, caregiver, 'accepted', accepted.matched_at);

  return accepted.id;
end;
$$;

comment on function public.accept_care_request(uuid) is '대기중 요청을 수락해 matched 로 바꾸고 matches 행을 만든다. 이미 넘어간 요청이면 null 을, 이 요청에서 오지 않았던 간병인이면 예외를 돌려준다.';

revoke all on function public.accept_care_request(uuid) from public, anon;
grant execute on function public.accept_care_request(uuid) to authenticated;

-- 46) 오지 않았던 간병인은 이 요청의 추천에서 뺀다 ----------------------------
--
-- 수락을 막는 것만으로는 모자란다. 목록에 그대로 남아 있으면 보호자가 그 사람을 다시
-- 고르려다 막히는 일이 생기고, 무엇보다 오지 않았던 사람이 추천된다는 것 자체가
-- 이 목록을 믿을 수 없게 만든다.
--
-- 반환 컬럼은 그대로이므로 create or replace 로 바꿀 수 있다. where 절 한 줄만 늘었다.
-- 다른 요청에서는 그대로 후보가 된다 — 노쇼 한 번으로 일을 못 하게 막지는 않는다.

create or replace function public.recommendation_candidates(request_id uuid)
returns table (
  caregiver_id uuid,
  name text,
  gender text,
  years_of_experience smallint,
  certifications text[],
  skills text[],
  care_types text[],
  regions text[],
  min_daily_wage integer,
  introduction text,
  availability text[],
  rating_avg numeric,
  review_count integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  req public.care_requests%rowtype;
begin
  select * into req from public.care_requests r where r.id = request_id;

  if req.id is null or req.guardian_id <> (select auth.uid()) then
    return;
  end if;

  return query
  select
    p.id,
    public.mask_person_name(pr.name),
    p.gender,
    p.years_of_experience,
    p.certifications,
    p.skills,
    p.care_types,
    p.regions,
    p.min_daily_wage,
    p.introduction,
    coalesce(
      array_agg(a.weekday || ':' || a.slot) filter (where a.weekday is not null),
      '{}'
    ),
    ur.rating_avg,
    coalesce(ur.review_count, 0)
  from public.caregiver_profiles p
  join public.profiles pr on pr.id = p.id
  left join public.caregiver_availability a on a.caregiver_id = p.id
  -- 후기가 없는 간병인도 후보에서 빠지지 않는다 (left join)
  left join public.user_ratings ur on ur.user_id = p.id
  where
    req.care_type = any (p.care_types)
    and (req.preferred_caregiver_gender = 'any' or p.gender = req.preferred_caregiver_gender)
    and p.id is distinct from req.matched_caregiver_id
    -- 이 요청에 오지 않았던 사람은 뺀다 (Phase 10)
    and not exists (
      select 1 from public.matches m
      where m.request_id = req.id
        and m.caregiver_id = p.id
        and m.status = 'no_show'
    )
  group by p.id, pr.name, ur.rating_avg, ur.review_count
  order by p.years_of_experience desc, p.id
  limit 50;
end;
$$;

comment on function public.recommendation_candidates(uuid) is '요청의 추천 후보가 될 수 있는 간병인. 이 요청에 오지 않았던 사람은 빠진다. 평균 별점을 함께 내보내되 점수는 매기지 않는다.';

revoke all on function public.recommendation_candidates(uuid) from public, anon;
grant execute on function public.recommendation_candidates(uuid) to authenticated;

-- 47) 매칭 상세 뷰에 노쇼 얹기 ------------------------------------------------
--
-- 컬럼이 늘고 "성사된 매칭인가"의 뜻이 달라지므로 뷰를 다시 만든다.
-- 취소와 마찬가지로, 오지 않은 매칭에서는 상대의 이름과 연락처를 다시 가린다 —
-- 성사되지 않은 만남의 연락처를 이력이라는 이유로 계속 열어 둘 까닭이 없다.
--
-- 신고한 사람(no_show_reported_by)은 내보내지 않는다. 언제나 보호자이므로
-- 식별자를 한 번 더 실어 보내도 새로 알 수 있는 것이 없다.

-- 컬럼이 늘어나므로 create or replace 로는 안 되고 먼저 지워야 한다.
-- 나머지는 Phase 7 의 정의 그대로이며, 바뀐 것은 engaged 한 줄이다.
drop view if exists public.match_details;

create or replace view public.match_details
with (security_invoker = false) as
select
  m.id,
  m.request_id,
  m.guardian_id,
  m.caregiver_id,
  m.status,
  m.accepted_at,
  m.started_at,
  m.completed_at,
  m.cancelled_at,
  m.cancelled_by,
  m.cancel_reason,
  m.no_show_at,
  m.no_show_note,
  m.created_at,
  m.updated_at,

  r.request_text,
  r.care_type,
  r.region,
  r.start_date,
  r.end_date,
  r.daily_start_time,
  r.daily_end_time,
  r.required_skills,
  r.budget_per_day,

  case when v.viewer = m.guardian_id or v.engaged then pt.name
       else public.mask_person_name(pt.name) end as patient_name,
  pt.birth_year as patient_birth_year,
  pt.gender as patient_gender,
  pt.mobility as patient_mobility,
  pt.cognition as patient_cognition,
  pt.conditions as patient_conditions,
  case when v.viewer = m.guardian_id or v.engaged then pt.care_notes end as patient_care_notes,

  case when v.viewer = m.caregiver_id or v.engaged then cg.name
       else public.mask_person_name(cg.name) end as caregiver_name,
  case when v.viewer = m.caregiver_id or v.engaged then cg.phone end as caregiver_phone,

  case when v.viewer = m.guardian_id or v.engaged then gu.name
       else public.mask_person_name(gu.name) end as guardian_name,
  case when v.viewer = m.guardian_id or v.engaged then gu.phone end as guardian_phone
from public.matches m
join public.care_requests r on r.id = m.request_id
join public.patients pt on pt.id = r.patient_id
join public.profiles cg on cg.id = m.caregiver_id
join public.profiles gu on gu.id = m.guardian_id
-- 같은 판정을 열 개 가까이 되풀이하지 않도록 한 번만 계산해 둔다.
-- engaged = 만남이 성사되어 있는 매칭. 취소된 것에 더해 간병인이 오지 않은 것도 빠진다.
-- 자기 자신의 자료는 engaged 와 무관하게 보인다.
cross join lateral (
  select (select auth.uid()) as viewer, m.status not in ('cancelled', 'no_show') as engaged
) v
where m.guardian_id = v.viewer or m.caregiver_id = v.viewer;

comment on view public.match_details is '매칭 당사자가 서로와 간병 내용을 읽는 창구. 취소되거나 간병인이 오지 않은 매칭은 연락처와 특이사항을 다시 가린다.';

revoke all on public.match_details from anon;
grant select on public.match_details to authenticated;

-- 48) 아직 열지 않은 것 -------------------------------------------------------
--
--   노쇼 신고 취소: 열지 않았다. 상대의 기록에 남는 판정이라 조용히 사라지면 안 된다.
--     잘못된 신고의 이의 제기와 취소는 Phase 11(관리자)에서 별도 창구로 다룬다 —
--     후기를 고치거나 지울 수 없게 둔 것과 같은 이유다.
--   간병인 쪽 노쇼: 보호자가 약속한 자리에 없는 경우도 있지만 지금은 다루지 않는다.
--     간병인은 취소로 처리하고 사유를 남긴다. 양쪽을 같은 표에서 다루려면
--     "누가 누구를 신고했는가"가 필요한데, 그때는 신고 자체를 별도 표로 옮기는 편이 낫다.
--   노쇼 이력을 보호자에게 보여 주기: 지금은 그 요청 안에서만 쓰인다.
--     추천 후보에 사람별 노쇼 횟수를 얹으면 보호자가 미리 알 수 있지만, 반환 컬럼이
--     바뀌는 일이고 몇 건부터 어떻게 보여 줄지도 정해야 한다. Phase 11 에서 함께 다룬다.
--   자동 노쇼 판정: 시간이 지났다는 이유만으로 노쇼를 매기지 않는다. 간병인이 와 있는데
--     시작 버튼만 누르지 않았을 수도 있고, 둘이 이야기해서 미뤘을 수도 있다.
--     화면은 "확인이 필요합니다"까지만 말하고 판단은 그 자리에 있던 사람에게 맡긴다.

-- ===========================================================================
-- Phase 11 — 관리자
-- ===========================================================================
--
-- 여기까지 오는 동안 "당사자가 조용히 바꿀 수 없다"를 여러 번 세워 두었다.
-- 후기는 고치거나 지울 수 없고(Phase 8), 노쇼 신고도 취소할 수 없다(Phase 10).
-- 그 규칙이 옳으려면, 잘못 남은 기록을 되돌리는 창구가 어딘가에는 있어야 한다.
-- 그 창구가 관리자다.
--
-- 그래서 관리자는 다른 역할과 성격이 다르다. 보호자와 간병인은 자기 자료를 다루지만
-- 관리자는 남의 기록을 바꾼다. 두 가지를 먼저 못 박고 시작한다.
--
--   (1) 관리자가 되는 길은 하나뿐이다 — 운영자가 직접 바꿔 준다.
--   (2) 관리자가 한 일은 모두 남는다.
--
-- 이 절은 (1)만 다룬다. (2)의 감사 로그와 실제 조치 창구는 뒤따르는 절에서 연다.

-- 49) 관리자 판별 --------------------------------------------------------------
--
-- is_caregiver() 와 같은 이유로 security definer 로 감싼다. 정책이나 뷰 안에서
-- profiles 를 그대로 조회하면 profiles 의 정책이 다시 걸려 재귀가 생긴다.
--
-- JWT 클레임(app_metadata.role)에 역할을 실어 두는 방법도 있다. 조회가 한 번 줄지만,
-- 클레임은 로그인 시점의 값이라 권한을 거둔 뒤에도 토큰이 만료될 때까지 살아 있다.
-- 관리자 권한은 거두는 즉시 끊기는 편이 낫다.
--
-- 아래 50) 의 트리거가 이 함수를 부르므로 먼저 만든다.

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

comment on function public.is_admin() is '로그인한 사용자가 관리자인지 확인한다. 정책·뷰 안의 재귀를 피하려고 함수로 감싼다.';

-- 50) 이용 유형은 스스로 바꿀 수 없다 -----------------------------------------
--
-- Phase 2 에서 가입 트리거(handle_new_user)가 user_metadata 의 role 을 걸러내므로
-- "admin 으로 가입"은 불가능하다. 그런데 가입한 뒤가 열려 있었다.
--
-- "본인 프로필 수정" 정책은 자기 행 전체를 열어 준다. RLS 는 행 단위라 컬럼을 가리지
-- 못하기 때문이다. anon 키는 앱 번들에 그대로 들어 있으므로, 로그인한 사용자라면
-- 누구나 REST 로 이렇게 부를 수 있었다.
--
--   update profiles set role = 'admin' where id = <자기 id>;
--
-- 앱에는 프로필을 수정하는 경로가 아직 없어서 드러나지 않았을 뿐이다.
-- 관리자 권한을 만들기 전에 이것부터 막는다 — 막지 않으면 아래의 모든 권한 설계가
-- 자기 행 update 한 번으로 우회된다.
--
-- 정책을 지우지 않고 트리거로 컬럼만 잠근다. 이름과 전화번호는 본인이 고칠 수 있어야
-- 하고(프로필 수정 화면이 생기면 그 경로가 필요하다), 잠글 것은 두 컬럼뿐이다.
--
--   role  — 권한 그 자체다.
--   email — 운영자가 계정을 찾는 열쇠다. 관리자 지정은 이메일로 하는데(아래 51 참고),
--           본인이 남의 이메일로 바꿀 수 있으면 운영자가 엉뚱한 계정을 올릴 수 있다.
--
-- id 는 정책의 with check ((select auth.uid()) = id) 가 이미 붙들고 있어서 따로 막지 않는다.

create or replace function public.guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- 로그인 세션 없이 도는 경우는 운영자다 — SQL Editor 와 service_role 키에는
  -- JWT 의 sub 가 없어서 auth.uid() 가 null 이 된다. 이 경로로 관리자를 지정한다.
  if (select auth.uid()) is null or public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception '이용 유형은 스스로 바꿀 수 없습니다.' using errcode = '42501';
  end if;

  if new.email is distinct from old.email then
    raise exception '이메일은 프로필에서 바꿀 수 없습니다.' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.guard_profile_self_update() is
  '본인이 자기 role 과 email 을 바꾸는 것을 막는다. RLS 는 컬럼을 가리지 못해 트리거로 잠근다.';

drop trigger if exists profiles_guard_self_update on public.profiles;
create trigger profiles_guard_self_update
  before update on public.profiles
  for each row execute function public.guard_profile_self_update();

-- 51) 관리자가 사람을 찾는 창구 ------------------------------------------------
--
-- 관리자에게 여는 테이블 정책은 이것 하나뿐이다. 신고된 후기와 분쟁 매칭은
-- 테이블을 통째로 열지 않고 뒤따르는 절의 admin_*() 함수로 내보낸다 —
-- 관리자가 무엇을 볼 수 있는지가 함수 목록에 다 드러나고, 모든 조치가
-- 감사 로그를 남길 자리를 함수 안에 갖게 된다.
--
-- select 정책이 여럿이면 or 로 묶이므로, 이 정책이 늘어도 "본인 프로필 조회"는 그대로다.

drop policy if exists "관리자 프로필 조회" on public.profiles;
create policy "관리자 프로필 조회"
  on public.profiles for select
  to authenticated
  using (public.is_admin());

-- 관리자 지정은 앱에 창구를 두지 않는다. 아래 문장의 이메일을 바꿔서 SQL Editor 에서 실행한다.
-- 50) 의 트리거는 auth.uid() 가 null 인 이 경로를 통과시킨다.
--
--   update public.profiles set role = 'admin' where email = 'admin@example.com';
