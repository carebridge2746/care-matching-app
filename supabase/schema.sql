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
