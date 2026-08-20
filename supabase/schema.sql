-- AI 간병 매칭 플랫폼 — 인증에 필요한 스키마 (Phase 2)
--
-- 적용 방법: Supabase 대시보드 → SQL Editor 에 이 파일 내용을 붙여넣고 실행한다.
-- 여러 번 실행해도 안전하도록 작성했다.
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
