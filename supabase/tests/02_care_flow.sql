-- 02) 간병 진행 흐름 검증 — 수락 · 시작 · 종료 · 취소 · 노쇼
--
-- schema.sql 20)~25) 수락·시작·종료·취소와 44)~46) 노쇼 신고·재수락 차단·추천 제외를
-- 실제 함수로 한 번씩 밟아 본다.
-- 실행 방법과 출력 읽는 법은 supabase/tests/README.md 를 본다.
--
-- 사용자 흉내 내기는 01 과 같다 (request.jwt.claims + set local role authenticated).
-- 확인만 하는 블록은 운영자(reset role)로 돌려 RLS 에 가리지 않고 읽는다.
--
-- 등장인물 (id 고정 · rollback 으로 사라진다)
--   보호자 G   20000000-0000-4000-8000-000000000001
--   간병인 C1  20000000-0000-4000-8000-000000000002
--   간병인 C2  20000000-0000-4000-8000-000000000003
--   환자 P     20000000-0000-4000-8000-000000000101
--   요청 R1    20000000-0000-4000-8000-000000000201  시작일 어제 — 수락 → 시작 → 종료
--   요청 R2    20000000-0000-4000-8000-000000000202  시작일 어제 — 시작 전 취소 → 재수락 → 시작 후 취소
--   요청 R3    20000000-0000-4000-8000-000000000203  시작일 오늘(한국) — 노쇼 신고
--   요청 R4    20000000-0000-4000-8000-000000000204  시작일 내일(한국) — 시작일 전 노쇼 신고는 거부

begin;

-- 0) 준비 --------------------------------------------------------------------

set local request.jwt.claim.sub to '';
set local request.jwt.claims to '';
reset role;

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 't02-guardian@example.test', '',
   '{"provider":"email","providers":["email"]}', '{"name":"김보호","role":"guardian"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 't02-caregiver1@example.test', '',
   '{"provider":"email","providers":["email"]}', '{"name":"이간병","role":"caregiver"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '20000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 't02-caregiver2@example.test', '',
   '{"provider":"email","providers":["email"]}', '{"name":"최간병","role":"caregiver"}', now(), now());

-- 수락은 profiles.role 만 본다(is_caregiver). caregiver_profiles 는 추천 후보에 나오기 위해 필요하다.
-- 경력을 최댓값(60)으로 두어, 기존 간병인이 많은 프로젝트에서도 추천의 limit 50 안에 들게 한다.
insert into public.caregiver_profiles (id, gender, years_of_experience, care_types, regions)
values
  ('20000000-0000-4000-8000-000000000002', 'female', 60, '{hospital}', '{서울 강남구}'),
  ('20000000-0000-4000-8000-000000000003', 'female', 60, '{hospital}', '{서울 강남구}');

-- 1) 보호자가 환자와 요청을 올린다 ----------------------------------------------

set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

-- 시드를 운영자로 넣지 않고 보호자 권한으로 넣는다. insert 정책이 막혀 있으면 앱의 첫 화면부터 멈춘다.
do $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  mine integer;
begin
  insert into public.patients (id, guardian_id, name, birth_year, gender, mobility)
  values ('20000000-0000-4000-8000-000000000101', '20000000-0000-4000-8000-000000000001',
          '박환자', 1940, 'female', 'assisted');

  insert into public.care_requests (id, guardian_id, patient_id, request_text, care_type, region, start_date)
  values
    ('20000000-0000-4000-8000-000000000201', '20000000-0000-4000-8000-000000000001',
     '20000000-0000-4000-8000-000000000101', '어머니 병원 간병 요청입니다 (정상 흐름)', 'hospital', '서울 강남구', today - 1),
    ('20000000-0000-4000-8000-000000000202', '20000000-0000-4000-8000-000000000001',
     '20000000-0000-4000-8000-000000000101', '어머니 병원 간병 요청입니다 (취소 흐름)', 'hospital', '서울 강남구', today - 1),
    ('20000000-0000-4000-8000-000000000203', '20000000-0000-4000-8000-000000000001',
     '20000000-0000-4000-8000-000000000101', '어머니 병원 간병 요청입니다 (노쇼 흐름)', 'hospital', '서울 강남구', today),
    ('20000000-0000-4000-8000-000000000204', '20000000-0000-4000-8000-000000000001',
     '20000000-0000-4000-8000-000000000101', '어머니 병원 간병 요청입니다 (내일 시작)', 'hospital', '서울 강남구', today + 1);

  select count(*) into mine from public.care_requests r
  where r.guardian_id = '20000000-0000-4000-8000-000000000001' and r.status = 'pending';
  if mine <> 4 then
    raise exception 'FAIL: 보호자가 본인 환자와 간병 요청을 등록할 수 있다 (대기중 요청 %)', mine;
  end if;
  raise notice 'PASS: 보호자가 본인 환자와 간병 요청을 등록할 수 있다';
end $$;

-- with check 가 빠지면 남의 계정 아래로 환자를 만들어 넣을 수 있다.
do $$
declare
  rejected boolean := false;
begin
  begin
    insert into public.patients (guardian_id, name, birth_year, gender, mobility)
    values ('20000000-0000-4000-8000-000000000002', '남의환자', 1950, 'male', 'independent');
  exception when others then
    if sqlstate <> '42501' then
      raise exception 'FAIL: 보호자는 다른 사람 이름으로 환자를 등록할 수 없다 (예상 42501, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 보호자는 다른 사람 이름으로 환자를 등록할 수 없다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 보호자는 다른 사람 이름으로 환자를 등록할 수 없다 (42501)';
end $$;

-- schema.sql 20) 의 컬럼 권한. 풀려 있으면 보호자가 매칭 기록을 제멋대로 채운다.
do $$
declare
  rejected boolean := false;
begin
  begin
    update public.care_requests
       set matched_caregiver_id = '20000000-0000-4000-8000-000000000002'
     where id = '20000000-0000-4000-8000-000000000201';
  exception when others then
    if sqlstate <> '42501' then
      raise exception 'FAIL: 보호자는 matched_caregiver_id 를 직접 바꿀 수 없다 (예상 42501, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 보호자는 matched_caregiver_id 를 직접 바꿀 수 없다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 보호자는 matched_caregiver_id 를 직접 바꿀 수 없다 (42501)';
end $$;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.accept_care_request('20000000-0000-4000-8000-000000000201');
  exception when others then
    if sqlstate <> '42501' then
      raise exception 'FAIL: 보호자는 요청을 수락할 수 없다 (예상 42501, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 보호자는 요청을 수락할 수 없다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 보호자는 요청을 수락할 수 없다 (42501)';
end $$;

-- 2) R1 — 수락 → 시작 → 종료 ---------------------------------------------------

reset role;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

do $$
declare
  got uuid;
begin
  got := public.accept_care_request('20000000-0000-4000-8000-000000000201');
  if got is distinct from '20000000-0000-4000-8000-000000000201' then
    raise exception 'FAIL: 간병인이 대기중 요청을 수락하면 요청 id 를 돌려받는다 (실제 %)', got;
  end if;
  raise notice 'PASS: 간병인이 대기중 요청을 수락하면 요청 id 를 돌려받는다';
end $$;

reset role;
set local request.jwt.claims to '';

-- 요청 상태와 matches 행은 한 트랜잭션에서 함께 만들어져야 한다. 앞만 남으면 간병 화면이 비어 버린다.
do $$
declare
  req public.care_requests%rowtype;
  live integer;
  match_row uuid;
begin
  select * into req from public.care_requests r where r.id = '20000000-0000-4000-8000-000000000201';
  select count(*), min(m.id::text)::uuid into live, match_row
  from public.matches m
  where m.request_id = '20000000-0000-4000-8000-000000000201'
    and m.caregiver_id = '20000000-0000-4000-8000-000000000002'
    and m.status = 'accepted';
  if req.status <> 'matched'
     or req.matched_caregiver_id is distinct from '20000000-0000-4000-8000-000000000002'
     or req.matched_at is null
     or live <> 1 then
    raise exception 'FAIL: 수락하면 요청은 matched, 매칭은 accepted 한 줄이 된다 (요청 %, 매칭 %)', req.status, live;
  end if;
  perform set_config('test.m1', match_row::text, false);
  raise notice 'PASS: 수락하면 요청은 matched, 매칭은 accepted 한 줄이 된다';
end $$;

set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;

-- 동시에 눌러도 한 명만 가져가야 한다. 없는 요청과 구분하지 않고 null 을 돌려준다.
do $$
declare
  got uuid;
begin
  got := public.accept_care_request('20000000-0000-4000-8000-000000000201');
  if got is not null then
    raise exception 'FAIL: 이미 매칭된 요청을 다른 간병인이 수락하면 null 이다 (실제 %)', got;
  end if;
  raise notice 'PASS: 이미 매칭된 요청을 다른 간병인이 수락하면 null 이다';
end $$;

do $$
declare
  got uuid;
begin
  got := public.start_care(current_setting('test.m1')::uuid);
  if got is not null then
    raise exception 'FAIL: 당사자가 아닌 간병인은 간병을 시작할 수 없다 (실제 %)', got;
  end if;
  raise notice 'PASS: 당사자가 아닌 간병인은 간병을 시작할 수 없다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

-- start_care 는 예외 대신 null 을 돌려준다(schema.sql 23). 출근한 간병인만 누르는 버튼이다.
do $$
declare
  got uuid;
  now_status text;
begin
  got := public.start_care(current_setting('test.m1')::uuid);
  select m.status into now_status from public.matches m where m.id = current_setting('test.m1')::uuid;
  if got is not null or now_status <> 'accepted' then
    raise exception 'FAIL: 보호자는 간병을 시작할 수 없다 (반환 %, 상태 %)', got, now_status;
  end if;
  raise notice 'PASS: 보호자는 간병을 시작할 수 없다 (null)';
end $$;

do $$
declare
  got uuid;
begin
  got := public.complete_care(current_setting('test.m1')::uuid);
  if got is not null then
    raise exception 'FAIL: 시작하지 않은 간병은 종료할 수 없다 (실제 %)', got;
  end if;
  raise notice 'PASS: 시작하지 않은 간병은 종료할 수 없다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

-- 간병인은 care_requests 를 직접 읽지 못하므로 caregiver_care_requests 뷰로 요청 상태를 본다.
do $$
declare
  got uuid;
  m_status text;
  m_started timestamptz;
  r_status text;
begin
  got := public.start_care(current_setting('test.m1')::uuid);
  select m.status, m.started_at into m_status, m_started
  from public.matches m where m.id = current_setting('test.m1')::uuid;
  select v.status into r_status
  from public.caregiver_care_requests v where v.id = '20000000-0000-4000-8000-000000000201';
  if got is distinct from current_setting('test.m1')::uuid
     or m_status <> 'in_progress' or m_started is null or r_status is distinct from 'in_progress' then
    raise exception 'FAIL: 당사자 간병인이 시작하면 매칭과 요청이 in_progress 가 된다 (매칭 %, 요청 %)', m_status, r_status;
  end if;
  raise notice 'PASS: 당사자 간병인이 시작하면 매칭과 요청이 in_progress 가 된다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

-- 보호자와 간병인 어느 쪽이든 종료할 수 있어야 한다. 여기서는 보호자가 누른다.
do $$
declare
  got uuid;
  m_status text;
  m_completed timestamptz;
  r_status text;
begin
  got := public.complete_care(current_setting('test.m1')::uuid);
  select m.status, m.completed_at into m_status, m_completed
  from public.matches m where m.id = current_setting('test.m1')::uuid;
  select r.status into r_status from public.care_requests r where r.id = '20000000-0000-4000-8000-000000000201';
  if got is distinct from current_setting('test.m1')::uuid
     or m_status <> 'completed' or m_completed is null or r_status <> 'completed' then
    raise exception 'FAIL: 보호자가 종료하면 매칭과 요청이 completed 가 된다 (매칭 %, 요청 %)', m_status, r_status;
  end if;
  raise notice 'PASS: 보호자가 종료하면 매칭과 요청이 completed 가 된다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

-- 끝난 간병을 취소로 덮어쓰면 후기의 입구(completed)가 사라진다.
do $$
declare
  got uuid;
  m_status text;
begin
  got := public.cancel_match(current_setting('test.m1')::uuid, '끝난 뒤 취소 시도');
  select m.status into m_status from public.matches m where m.id = current_setting('test.m1')::uuid;
  if got is not null or m_status <> 'completed' then
    raise exception 'FAIL: 종료된 간병은 취소할 수 없다 (반환 %, 상태 %)', got, m_status;
  end if;
  raise notice 'PASS: 종료된 간병은 취소할 수 없다';
end $$;

-- 3) R2 — 시작 전 취소 → 재수락 → 시작 후 취소 ------------------------------------

-- 준비: C1 이 R2 를 수락한다 (실패하면 멈추고, 통과 알림은 남기지 않는다)
do $$
begin
  if public.accept_care_request('20000000-0000-4000-8000-000000000202') is null then
    raise exception 'FAIL: [준비] 간병인 C1 이 요청 R2 를 수락하지 못했다';
  end if;
end $$;

reset role;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

-- 시작 전 취소는 요청을 다시 연다. matched_caregiver_id 를 비우지 않으면 제약에 걸려 함수가 통째로 실패한다.
do $$
declare
  target uuid;
  got uuid;
  m public.matches%rowtype;
  req public.care_requests%rowtype;
begin
  select x.id into target from public.matches x
  where x.request_id = '20000000-0000-4000-8000-000000000202' and x.status = 'accepted';

  got := public.cancel_match(target, '  사정이 생겼습니다  ');
  select * into m from public.matches x where x.id = target;
  select * into req from public.care_requests r where r.id = '20000000-0000-4000-8000-000000000202';

  if got is distinct from target
     or m.status <> 'cancelled' or m.cancelled_at is null
     or m.cancelled_by is distinct from '20000000-0000-4000-8000-000000000001'
     or m.cancel_reason is distinct from '사정이 생겼습니다'
     or req.status <> 'pending' or req.matched_caregiver_id is not null or req.matched_at is not null then
    raise exception 'FAIL: 시작 전에 취소하면 매칭은 cancelled, 요청은 pending 으로 돌아간다 (매칭 %, 요청 %, 사유 %)',
      m.status, req.status, m.cancel_reason;
  end if;
  raise notice 'PASS: 시작 전에 취소하면 매칭은 cancelled, 요청은 pending 으로 돌아간다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;

-- 취소된 매칭은 살아 있는 매칭이 아니므로 matches_live_per_request_idx 에 걸리지 않아야 한다.
do $$
declare
  got uuid;
begin
  got := public.accept_care_request('20000000-0000-4000-8000-000000000202');
  if got is distinct from '20000000-0000-4000-8000-000000000202' then
    raise exception 'FAIL: 시작 전 취소로 다시 열린 요청은 다른 간병인이 수락할 수 있다 (실제 %)', got;
  end if;
  raise notice 'PASS: 시작 전 취소로 다시 열린 요청은 다른 간병인이 수락할 수 있다';
end $$;

-- 준비: C2 가 R2 간병을 시작한다
do $$
declare
  target uuid;
begin
  select x.id into target from public.matches x
  where x.request_id = '20000000-0000-4000-8000-000000000202' and x.status = 'accepted';
  if public.start_care(target) is null then
    raise exception 'FAIL: [준비] 간병인 C2 가 R2 간병을 시작하지 못했다';
  end if;
  perform set_config('test.m2', target::text, false);
end $$;

reset role;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

-- 와서 하다가 끊긴 것은 노쇼가 아니라 취소다 (schema.sql 43 의 제약).
do $$
declare
  got uuid;
  m_status text;
begin
  got := public.report_no_show(current_setting('test.m2')::uuid, '시작 뒤 신고 시도');
  select m.status into m_status from public.matches m where m.id = current_setting('test.m2')::uuid;
  if got is not null or m_status <> 'in_progress' then
    raise exception 'FAIL: 이미 시작한 간병에는 노쇼를 신고할 수 없다 (반환 %, 상태 %)', got, m_status;
  end if;
  raise notice 'PASS: 이미 시작한 간병에는 노쇼를 신고할 수 없다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;

-- 시작한 뒤의 취소는 요청을 닫는다. 남은 기간을 그대로 다시 매칭하지 않는다.
-- matched_caregiver_id 가 남으므로 간병인은 뷰에서 이 요청을 계속 볼 수 있다.
do $$
declare
  got uuid;
  m public.matches%rowtype;
  r_status text;
  r_caregiver uuid;
begin
  got := public.cancel_match(current_setting('test.m2')::uuid, '건강 문제로 중단');
  select * into m from public.matches x where x.id = current_setting('test.m2')::uuid;
  select v.status, v.matched_caregiver_id into r_status, r_caregiver
  from public.caregiver_care_requests v where v.id = '20000000-0000-4000-8000-000000000202';
  if got is distinct from current_setting('test.m2')::uuid
     or m.status <> 'cancelled'
     or m.cancelled_by is distinct from '20000000-0000-4000-8000-000000000003'
     or r_status is distinct from 'cancelled'
     or r_caregiver is distinct from '20000000-0000-4000-8000-000000000003' then
    raise exception 'FAIL: 시작한 뒤 취소하면 요청은 cancelled 로 닫힌다 (매칭 %, 요청 %)', m.status, r_status;
  end if;
  raise notice 'PASS: 시작한 뒤 취소하면 요청은 cancelled 로 닫힌다';
end $$;

-- 4) R3 · R4 — 노쇼 -------------------------------------------------------------

reset role;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

-- 준비: C1 이 R3(오늘 시작)과 R4(내일 시작)를 수락한다
do $$
begin
  if public.accept_care_request('20000000-0000-4000-8000-000000000203') is null
     or public.accept_care_request('20000000-0000-4000-8000-000000000204') is null then
    raise exception 'FAIL: [준비] 간병인 C1 이 요청 R3 · R4 를 수락하지 못했다';
  end if;
end $$;

-- 오지 않았다는 것을 아는 사람은 보호자뿐이다. 간병인이 부르면 없는 매칭처럼 null 이다.
do $$
declare
  target uuid;
  got uuid;
  m_status text;
begin
  select x.id into target from public.matches x
  where x.request_id = '20000000-0000-4000-8000-000000000203' and x.status = 'accepted';
  got := public.report_no_show(target, '간병인이 스스로 신고');
  select x.status into m_status from public.matches x where x.id = target;
  if got is not null or m_status <> 'accepted' then
    raise exception 'FAIL: 간병인은 노쇼를 신고할 수 없다 (반환 %, 상태 %)', got, m_status;
  end if;
  raise notice 'PASS: 간병인은 노쇼를 신고할 수 없다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

-- 아직 오지 않은 날짜를 미리 신고하면 멀쩡한 간병인이 그 요청에서 영영 빠진다.
do $$
declare
  target uuid;
  rejected boolean := false;
begin
  select x.id into target from public.matches x
  where x.request_id = '20000000-0000-4000-8000-000000000204' and x.status = 'accepted';
  begin
    perform public.report_no_show(target, '미리 신고');
  exception when others then
    if sqlstate <> '22023' then
      raise exception 'FAIL: 시작일(한국 날짜) 전에는 노쇼를 신고할 수 없다 (예상 22023, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 시작일(한국 날짜) 전에는 노쇼를 신고할 수 없다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 시작일(한국 날짜) 전에는 노쇼를 신고할 수 없다 (22023)';
end $$;

-- 시작일 당일부터 신고할 수 있어야 한다 — 대체 간병인이 가장 급한 날이다. 신고와 동시에 요청이 다시 열린다.
do $$
declare
  target uuid;
  got uuid;
  m public.matches%rowtype;
  req public.care_requests%rowtype;
begin
  select x.id into target from public.matches x
  where x.request_id = '20000000-0000-4000-8000-000000000203' and x.status = 'accepted';

  got := public.report_no_show(target, '  연락 없이 오지 않음  ');
  select * into m from public.matches x where x.id = target;
  select * into req from public.care_requests r where r.id = '20000000-0000-4000-8000-000000000203';

  if got is distinct from target
     or m.status <> 'no_show' or m.no_show_at is null or m.started_at is not null
     or m.no_show_reported_by is distinct from '20000000-0000-4000-8000-000000000001'
     or m.no_show_note is distinct from '연락 없이 오지 않음'
     or req.status <> 'pending' or req.matched_caregiver_id is not null or req.matched_at is not null then
    raise exception 'FAIL: 보호자가 시작일 당일 노쇼를 신고하면 매칭은 no_show, 요청은 pending 이 된다 (매칭 %, 요청 %, 메모 %)',
      m.status, req.status, m.no_show_note;
  end if;
  raise notice 'PASS: 보호자가 시작일 당일 노쇼를 신고하면 매칭은 no_show, 요청은 pending 이 된다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

-- 막지 않으면 오지 않았던 간병인이 다시 열린 같은 요청을 그대로 가져간다.
do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.accept_care_request('20000000-0000-4000-8000-000000000203');
  exception when others then
    if sqlstate <> '22023' then
      raise exception 'FAIL: 노쇼로 신고된 간병인은 같은 요청을 다시 수락할 수 없다 (예상 22023, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 노쇼로 신고된 간병인은 같은 요청을 다시 수락할 수 없다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 노쇼로 신고된 간병인은 같은 요청을 다시 수락할 수 없다 (22023)';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

do $$
begin
  if exists (select 1 from public.recommendation_candidates('20000000-0000-4000-8000-000000000203') c
             where c.caregiver_id = '20000000-0000-4000-8000-000000000002')
     or not exists (select 1 from public.recommendation_candidates('20000000-0000-4000-8000-000000000203') c
                    where c.caregiver_id = '20000000-0000-4000-8000-000000000003') then
    raise exception 'FAIL: 노쇼 간병인은 그 요청의 추천에서 빠지고 다른 간병인은 남는다';
  end if;
  raise notice 'PASS: 노쇼 간병인은 그 요청의 추천에서 빠지고 다른 간병인은 남는다';
end $$;

-- 노쇼 한 번으로 일을 못 하게 막지는 않는다. R2 는 C2 가 맡았다 닫혔으므로 C1 은 후보로 나와야 한다.
do $$
begin
  if not exists (select 1 from public.recommendation_candidates('20000000-0000-4000-8000-000000000202') c
                 where c.caregiver_id = '20000000-0000-4000-8000-000000000002') then
    raise exception 'FAIL: 노쇼 간병인도 다른 요청의 추천에는 그대로 나온다';
  end if;
  raise notice 'PASS: 노쇼 간병인도 다른 요청의 추천에는 그대로 나온다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;

-- no_show 는 살아 있는 매칭이 아니므로 새 간병인의 수락을 막지 않아야 한다.
do $$
declare
  got uuid;
begin
  got := public.accept_care_request('20000000-0000-4000-8000-000000000203');
  if got is distinct from '20000000-0000-4000-8000-000000000203' then
    raise exception 'FAIL: 노쇼 신고 뒤 다른 간병인은 같은 요청을 수락할 수 있다 (실제 %)', got;
  end if;
  raise notice 'PASS: 노쇼 신고 뒤 다른 간병인은 같은 요청을 수락할 수 있다';
end $$;

-- 시작일 전에는 시작할 수 없다 (schema.sql 64) ----------------------------------

-- "내일 시작" 요청(R4)을 간병인 C1 이 수락한 뒤 오늘 시작해 본다.
-- 막지 않으면 기간은 내일부터인데 기록은 오늘 시작·종료로 남아 서로 어긋난다.
reset role;
set local request.jwt.claims to '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

do $$
declare
  target uuid;
  got uuid;
  m_status text;
begin
  if public.accept_care_request('20000000-0000-4000-8000-000000000204') is null then
    raise exception 'FAIL: [준비] 간병인 C1 이 내일 시작하는 요청 R4 를 수락하지 못했다';
  end if;

  select x.id into target from public.matches x
  where x.request_id = '20000000-0000-4000-8000-000000000204' and x.status = 'accepted';

  got := public.start_care(target);
  select m.status into m_status from public.matches m where m.id = target;

  if got is not null or m_status <> 'accepted' then
    raise exception 'FAIL: 시작일 전에는 간병을 시작할 수 없다 (반환 %, 상태 %)', got, m_status;
  end if;
  raise notice 'PASS: 시작일 전에는 간병을 시작할 수 없다 (null)';
end $$;

-- 끝 ---------------------------------------------------------------------------

reset role;
set local request.jwt.claims to '';

do $$
begin
  raise notice '02_care_flow: 모든 검사 통과 (25개)';
end $$;

rollback;
