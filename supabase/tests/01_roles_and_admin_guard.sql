-- 01) 역할과 관리자 권한 잠금 검증
--
-- schema.sql 3) handle_new_user, 49)~51) is_admin · guard_profile_self_update · 관리자 정책,
-- 57)~63) admin_*() 함수의 권한 판정을 확인한다.
-- 실행 방법과 출력 읽는 법은 supabase/tests/README.md 를 본다.
--
-- 사용자 흉내 내기
--   set local request.jwt.claims to '{"sub":"<uuid>","role":"authenticated"}';
--   set local role authenticated;
-- Supabase 의 auth.uid() 는 request.jwt.claims 의 sub 를 읽는다.
-- 운영자(SQL Editor)로 돌아올 때는 reset role 과 함께 claims 를 비운다 — 비우지 않으면
-- auth.uid() 가 마지막 사용자로 남아, guard_profile_self_update() 가 운영자 경로로 보지 않는다.
--
-- 등장인물 (id 고정 · rollback 으로 사라진다)
--   U1 10000000-0000-4000-8000-000000000001  가입 metadata 에 role=admin 을 넣은 사용자
--   U2 10000000-0000-4000-8000-000000000002  간병인으로 가입한 사용자
--   U3 10000000-0000-4000-8000-000000000003  운영자가 관리자로 올릴 사용자

begin;

-- 0) 준비 --------------------------------------------------------------------

-- SQL Editor 에 이전 사용자 흉내가 남아 있으면 운영자 경로 검사가 틀어지므로 먼저 비운다.
set local request.jwt.claim.sub to '';
set local request.jwt.claims to '';
reset role;

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 't01-sneaky@example.test', '',
   '{"provider":"email","providers":["email"]}', '{"name":"김가입","role":"admin"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 't01-caregiver@example.test', '',
   '{"provider":"email","providers":["email"]}', '{"name":"  이간병  ","role":"caregiver"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '10000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 't01-admin@example.test', '',
   '{"provider":"email","providers":["email"]}', '{"name":"박관리","role":"guardian"}', now(), now());

-- 1) 가입 트리거가 role 을 걸러낸다 --------------------------------------------

-- user_metadata 는 사용자가 마음대로 넣는 값이다. 여기서 admin 이 통과하면 가입 한 번으로 관리자가 된다.
do $$
declare
  got text;
begin
  select p.role into got from public.profiles p where p.id = '10000000-0000-4000-8000-000000000001';
  if got is distinct from 'guardian' then
    raise exception 'FAIL: 가입 metadata 에 admin 을 넣어도 보호자로 만들어진다 (실제 %)', got;
  end if;
  raise notice 'PASS: 가입 metadata 에 admin 을 넣어도 보호자로 만들어진다';
end $$;

do $$
declare
  got_role text;
  got_name text;
begin
  select p.role, p.name into got_role, got_name
  from public.profiles p where p.id = '10000000-0000-4000-8000-000000000002';
  if got_role is distinct from 'caregiver' or got_name is distinct from '이간병' then
    raise exception 'FAIL: 간병인 가입은 간병인으로, 이름은 앞뒤 공백을 지워 만들어진다 (실제 %, %)', got_role, got_name;
  end if;
  raise notice 'PASS: 간병인 가입은 간병인으로, 이름은 앞뒤 공백을 지워 만들어진다';
end $$;

-- 2) 운영자 경로로 관리자 지정 --------------------------------------------------

-- schema.sql 51) 에 적힌 방법 그대로다. auth.uid() 가 null 이라 가드 트리거가 통과시킨다.
update public.profiles set role = 'admin' where id = '10000000-0000-4000-8000-000000000003';

do $$
declare
  got text;
begin
  select p.role into got from public.profiles p where p.id = '10000000-0000-4000-8000-000000000003';
  if got is distinct from 'admin' then
    raise exception 'FAIL: 운영자(SQL Editor) 경로로 관리자를 지정할 수 있다 (실제 %)', got;
  end if;
  raise notice 'PASS: 운영자(SQL Editor) 경로로 관리자를 지정할 수 있다';
end $$;

-- 로그인 세션이 없는 곳에서 is_admin() 이 참이면, 정책이 anon·service 경로를 관리자로 오인한다.
do $$
begin
  if public.is_admin() is distinct from false then
    raise exception 'FAIL: 로그인 없이 부르면 is_admin() 은 거짓이다';
  end if;
  raise notice 'PASS: 로그인 없이 부르면 is_admin() 은 거짓이다';
end $$;

-- log_admin_action 이 앱에 열려 있으면 아무나 없는 조치를 감사 로그에 적을 수 있다.
do $$
begin
  if has_function_privilege('authenticated', 'public.log_admin_action(text, text, uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.log_admin_action(text, text, uuid, text)', 'execute') then
    raise exception 'FAIL: log_admin_action 은 authenticated · anon 에 실행 권한이 없다';
  end if;
  raise notice 'PASS: log_admin_action 은 authenticated · anon 에 실행 권한이 없다';
end $$;

-- 관리자만 볼 수 있어야 하는 기록을 한 줄 심어 둔다. 비어 있으면 "안 보인다"를 확인할 수 없다.
insert into public.admin_actions (admin_id, action, target_type, target_id, note)
values ('10000000-0000-4000-8000-000000000003', 'match_cancelled', 'match', gen_random_uuid(), 't01 시드');

-- 3) 일반 사용자(U1) ------------------------------------------------------------

set local request.jwt.claims to '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

do $$
begin
  if public.is_admin() is distinct from false then
    raise exception 'FAIL: 보호자에게 is_admin() 은 거짓이다';
  end if;
  raise notice 'PASS: 보호자에게 is_admin() 은 거짓이다';
end $$;

-- "본인 프로필 수정" 정책은 행 전체를 열어 준다. 트리거가 막지 않으면 update 한 번으로 관리자가 된다.
do $$
declare
  rejected boolean := false;
begin
  begin
    update public.profiles set role = 'admin' where id = '10000000-0000-4000-8000-000000000001';
  exception when others then
    if sqlstate <> '42501' then
      raise exception 'FAIL: 로그인한 사용자는 자기 role 을 admin 으로 바꿀 수 없다 (예상 42501, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 로그인한 사용자는 자기 role 을 admin 으로 바꿀 수 없다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 로그인한 사용자는 자기 role 을 admin 으로 바꿀 수 없다 (42501)';
end $$;

-- 관리자 지정은 이메일로 계정을 찾는다. 남의 이메일로 바꿀 수 있으면 운영자가 엉뚱한 계정을 올린다.
do $$
declare
  rejected boolean := false;
begin
  begin
    update public.profiles set email = 't01-admin@example.test' where id = '10000000-0000-4000-8000-000000000001';
  exception when others then
    if sqlstate <> '42501' then
      raise exception 'FAIL: 로그인한 사용자는 자기 email 을 바꿀 수 없다 (예상 42501, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 로그인한 사용자는 자기 email 을 바꿀 수 없다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 로그인한 사용자는 자기 email 을 바꿀 수 없다 (42501)';
end $$;

-- 잠금이 role · email 두 컬럼에서 멈추는지 본다. 이름까지 막히면 프로필 수정 화면이 쓸 길이 없다.
do $$
declare
  changed integer;
begin
  update public.profiles set name = '김바뀜' where id = '10000000-0000-4000-8000-000000000001';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'FAIL: 로그인한 사용자는 자기 이름은 바꿀 수 있다 (바뀐 행 %)', changed;
  end if;
  raise notice 'PASS: 로그인한 사용자는 자기 이름은 바꿀 수 있다';
end $$;

do $$
declare
  visible integer;
begin
  select count(*) into visible from public.profiles;
  if visible <> 1 then
    raise exception 'FAIL: 관리자가 아니면 자기 프로필 한 줄만 보인다 (보이는 행 %)', visible;
  end if;
  raise notice 'PASS: 관리자가 아니면 자기 프로필 한 줄만 보인다';
end $$;

-- 테이블 권한이 없는 프로젝트라면 42501 로 막히고, Supabase 기본 권한이면 RLS 가 0행으로 막는다. 둘 다 통과다.
do $$
declare
  visible integer;
begin
  begin
    select count(*) into visible from public.admin_actions;
  exception when insufficient_privilege then
    visible := 0;
  end;
  if visible <> 0 then
    raise exception 'FAIL: 관리자가 아니면 admin_actions 를 읽을 수 없다 (보이는 행 %)', visible;
  end if;
  raise notice 'PASS: 관리자가 아니면 admin_actions 를 읽을 수 없다';
end $$;

-- 관리자 함수는 모두 security definer 라 RLS 를 지나간다. 첫 줄의 is_admin() 확인이 유일한 문이다.
do $$
declare
  stmt text;
  rejected boolean;
begin
  foreach stmt in array array[
    'select * from public.admin_review_reports()',
    'select public.admin_delete_review(gen_random_uuid())',
    'select public.admin_restore_review(gen_random_uuid())',
    'select public.admin_dismiss_report(gen_random_uuid())',
    'select * from public.admin_disputed_matches()',
    'select public.admin_clear_no_show(gen_random_uuid())',
    'select public.admin_cancel_match(gen_random_uuid())'
  ] loop
    rejected := false;
    begin
      execute stmt;
    exception when others then
      if sqlstate <> '42501' then
        raise exception 'FAIL: 관리자가 아니면 거부된다 — % (예상 42501, 실제 % %)', stmt, sqlstate, sqlerrm;
      end if;
      rejected := true;
    end;
    if not rejected then
      raise exception 'FAIL: 관리자가 아니면 거부된다 — % (거부되지 않음)', stmt;
    end if;
    raise notice 'PASS: 관리자가 아니면 거부된다 — %', stmt;
  end loop;
end $$;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.log_admin_action('review_deleted', 'review', gen_random_uuid(), '위조');
  exception when others then
    if sqlstate <> '42501' then
      raise exception 'FAIL: 로그인한 사용자는 log_admin_action 을 직접 부를 수 없다 (예상 42501, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 로그인한 사용자는 log_admin_action 을 직접 부를 수 없다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 로그인한 사용자는 log_admin_action 을 직접 부를 수 없다 (42501)';
end $$;

-- 4) 관리자(U3) -----------------------------------------------------------------

reset role;
set local request.jwt.claims to '{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;

do $$
begin
  if public.is_admin() is distinct from true then
    raise exception 'FAIL: 관리자에게 is_admin() 은 참이다';
  end if;
  raise notice 'PASS: 관리자에게 is_admin() 은 참이다';
end $$;

-- "관리자 프로필 조회" 정책이 붙어 있어야 관리자가 사람을 찾을 수 있다.
do $$
begin
  if not exists (select 1 from public.profiles p where p.id = '10000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: 관리자는 다른 사람의 프로필을 볼 수 있다';
  end if;
  raise notice 'PASS: 관리자는 다른 사람의 프로필을 볼 수 있다';
end $$;

do $$
begin
  if not exists (
    select 1 from public.admin_actions a
    where a.admin_id = '10000000-0000-4000-8000-000000000003' and a.note = 't01 시드'
  ) then
    raise exception 'FAIL: 관리자는 admin_actions 를 읽을 수 있다';
  end if;
  raise notice 'PASS: 관리자는 admin_actions 를 읽을 수 있다';
end $$;

-- 가드가 관리자까지 막으면 창구가 있으나 마나다. 예외 없이 끝나기만 하면 된다.
do $$
begin
  perform 1 from public.admin_review_reports('open');
  perform 1 from public.admin_disputed_matches();
  raise notice 'PASS: 관리자는 admin_review_reports · admin_disputed_matches 를 부를 수 있다';
end $$;

-- 끝 ---------------------------------------------------------------------------

reset role;
set local request.jwt.claims to '';

do $$
begin
  raise notice '01_roles_and_admin_guard: 모든 검사 통과 (23개)';
end $$;

rollback;
