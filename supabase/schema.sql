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
