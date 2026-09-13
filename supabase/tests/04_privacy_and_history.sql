-- 04) 기록 보존과 개인정보 규칙 검증 — 요청 수정·삭제 · 환자 익명화 · 원문 공개 범위 · 연락처 기간
--
-- schema.sql 65)~69) 을 실제 함수·정책·뷰로 한 번씩 밟아 본다.
-- 실행 방법과 출력 읽는 법은 supabase/tests/README.md 를 본다.
--
-- 사용자 흉내 내기는 01 · 02 와 같다 (request.jwt.claims + set local role authenticated).
-- RLS 가 가리는 결과를 확인할 때는 사용자 블록에서 값을 test.* 설정에 담고,
-- 운영자(reset role) 블록에서 행 자체를 읽어 판정한다.
--
-- 등장인물 (id 고정 · rollback 으로 사라진다)
--   보호자 G   40000000-0000-4000-8000-000000000001  박보호 · 010-1111-2222
--   간병인 C1  40000000-0000-4000-8000-000000000002  이간병 · 010-3333-4444
--   간병인 C2  40000000-0000-4000-8000-000000000003  최간병
--   환자 P1    …0101  기록 없음                          → 행째 삭제
--   환자 P2    …0102  끝난 간병 R2 + 손대지 않은 요청 R3  → 익명화
--   환자 P3    …0103  진행 중인 간병 R4                  → 삭제 거절
--   환자 P4    …0104  시작 전 취소로 다시 대기중인 R5    → 익명화하면서 R5 취소
--   환자 P5    …0105  권한·원문·연락처 검사용 (R6~R9)
-- 요청의 시작일은 모두 어제(한국)다. 시작일 전에는 start_care 가 거절한다(64).

begin;

-- 0) 준비 --------------------------------------------------------------------

set local request.jwt.claim.sub to '';
set local request.jwt.claims to '';
reset role;

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 't04-guardian@example.test', '',
   '{"provider":"email","providers":["email"]}', '{"name":"박보호","role":"guardian","phone":"010-1111-2222"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 't04-caregiver1@example.test', '',
   '{"provider":"email","providers":["email"]}', '{"name":"이간병","role":"caregiver","phone":"010-3333-4444"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 't04-caregiver2@example.test', '',
   '{"provider":"email","providers":["email"]}', '{"name":"최간병","role":"caregiver"}', now(), now());

-- 환자와 요청은 운영자로 넣는다. 등록 정책 자체는 02 에서 확인했다.
insert into public.patients (id, guardian_id, name, birth_year, gender, relationship, conditions, mobility, care_notes)
values
  ('40000000-0000-4000-8000-000000000101', '40000000-0000-4000-8000-000000000001', '하나환자', 1940, 'female', '어머니', '{치매}', 'assisted', '저녁 약'),
  ('40000000-0000-4000-8000-000000000102', '40000000-0000-4000-8000-000000000001', '두리환자', 1941, 'male', '아버지', '{당뇨}', 'assisted', '인슐린 시간'),
  ('40000000-0000-4000-8000-000000000103', '40000000-0000-4000-8000-000000000001', '세나환자', 1942, 'female', '이모', '{}', 'wheelchair', null),
  ('40000000-0000-4000-8000-000000000104', '40000000-0000-4000-8000-000000000001', '네오환자', 1943, 'male', '삼촌', '{}', 'independent', null),
  ('40000000-0000-4000-8000-000000000105', '40000000-0000-4000-8000-000000000001', '정환자', 1944, 'female', '할머니', '{고혈압}', 'assisted', '낙상 주의');

insert into public.care_requests (id, guardian_id, patient_id, request_text, care_type, region, start_date)
select x.id::uuid, '40000000-0000-4000-8000-000000000001', x.patient::uuid, x.request_text,
       'hospital', '서울 강남구', (now() at time zone 'Asia/Seoul')::date - 1
from (values
  ('40000000-0000-4000-8000-000000000201', '40000000-0000-4000-8000-000000000101', '하나환자 병원 간병 요청입니다 (R1)'),
  ('40000000-0000-4000-8000-000000000202', '40000000-0000-4000-8000-000000000102', '두리환자 병원 간병 요청입니다 (R2 끝난 간병)'),
  ('40000000-0000-4000-8000-000000000203', '40000000-0000-4000-8000-000000000102', '두리환자 병원 간병 요청입니다 (R3 손대지 않음)'),
  ('40000000-0000-4000-8000-000000000204', '40000000-0000-4000-8000-000000000103', '세나환자 병원 간병 요청입니다 (R4 진행 중)'),
  ('40000000-0000-4000-8000-000000000205', '40000000-0000-4000-8000-000000000104', '네오환자 병원 간병 요청입니다 (R5 시작 전 취소)'),
  ('40000000-0000-4000-8000-000000000206', '40000000-0000-4000-8000-000000000105', '정환자 병원 간병 요청입니다 (R6 취소 함수)'),
  ('40000000-0000-4000-8000-000000000207', '40000000-0000-4000-8000-000000000105', '정환자 병원 간병 요청입니다 (R7 삭제 가능)'),
  ('40000000-0000-4000-8000-000000000208', '40000000-0000-4000-8000-000000000105', '정환자 강남세브란스 7층입니다 (R8 원문)'),
  ('40000000-0000-4000-8000-000000000209', '40000000-0000-4000-8000-000000000105', '정환자 병원 간병 요청입니다 (R9 연락처 기간)')
) as x(id, patient, request_text);

-- 준비: 간병인 C1 이 R2·R4·R5·R6·R9 를 수락하고, R2·R9 는 끝까지, R5 는 시작 전에 취소한다
set local request.jwt.claims to '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

do $$
declare
  req uuid;
  m uuid;
begin
  foreach req in array array[
    '40000000-0000-4000-8000-000000000202', '40000000-0000-4000-8000-000000000204',
    '40000000-0000-4000-8000-000000000205', '40000000-0000-4000-8000-000000000206',
    '40000000-0000-4000-8000-000000000209'
  ]::uuid[] loop
    if public.accept_care_request(req) is null then
      raise exception 'FAIL: [준비] 간병인 C1 이 요청 % 를 수락하지 못했다', req;
    end if;
  end loop;

  select x.id into m from public.matches x where x.request_id = '40000000-0000-4000-8000-000000000202';
  perform set_config('test.m2', m::text, false);
  if public.start_care(m) is null or public.complete_care(m) is null then
    raise exception 'FAIL: [준비] R2 간병을 시작·종료하지 못했다';
  end if;

  select x.id into m from public.matches x where x.request_id = '40000000-0000-4000-8000-000000000209';
  perform set_config('test.m9', m::text, false);
  if public.start_care(m) is null or public.complete_care(m) is null then
    raise exception 'FAIL: [준비] R9 간병을 시작·종료하지 못했다';
  end if;

  select x.id into m from public.matches x where x.request_id = '40000000-0000-4000-8000-000000000205';
  if public.cancel_match(m, '사정이 생겼습니다') is null then
    raise exception 'FAIL: [준비] R5 간병을 시작 전에 취소하지 못했다';
  end if;
end $$;

reset role;
set local request.jwt.claims to '';

do $$
declare
  r5_status text;
begin
  select r.status into r5_status from public.care_requests r where r.id = '40000000-0000-4000-8000-000000000205';
  if r5_status <> 'pending' then
    raise exception 'FAIL: [준비] 시작 전 취소한 R5 는 다시 대기중이어야 한다 (실제 %)', r5_status;
  end if;
end $$;

-- 65) 요청 행은 함수로만 바꾼다 -------------------------------------------------

set local request.jwt.claims to '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

-- 풀려 있으면 보호자가 살아 있는 매칭의 요청을 completed 로 적어 기록과 어긋나게 만든다.
do $$
declare
  rejected boolean := false;
begin
  begin
    update public.care_requests set status = 'completed' where id = '40000000-0000-4000-8000-000000000206';
  exception when others then
    if sqlstate <> '42501' then
      raise exception 'FAIL: 보호자는 요청 status 를 직접 바꿀 수 없다 (예상 42501, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 보호자는 요청 status 를 직접 바꿀 수 없다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 보호자는 요청 status 를 직접 바꿀 수 없다 (42501)';
end $$;

-- 풀려 있으면 간병인이 수락한 뒤에 시작일·조건이 바뀐다.
do $$
declare
  rejected boolean := false;
begin
  begin
    update public.care_requests
       set start_date = start_date + 30
     where id = '40000000-0000-4000-8000-000000000206';
  exception when others then
    if sqlstate <> '42501' then
      raise exception 'FAIL: 보호자는 수락된 요청의 조건을 바꿀 수 없다 (예상 42501, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 보호자는 수락된 요청의 조건을 바꿀 수 없다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 보호자는 수락된 요청의 조건을 바꿀 수 없다 (42501)';
end $$;

do $$
declare
  got uuid;
  r_status text;
  m_status text;
begin
  got := public.cancel_care_request('40000000-0000-4000-8000-000000000206');
  select r.status into r_status from public.care_requests r where r.id = '40000000-0000-4000-8000-000000000206';
  select m.status into m_status from public.matches m where m.request_id = '40000000-0000-4000-8000-000000000206';
  if got is distinct from '40000000-0000-4000-8000-000000000206' or r_status <> 'cancelled' or m_status <> 'cancelled' then
    raise exception 'FAIL: cancel_care_request 는 요청과 살아 있던 매칭을 함께 취소한다 (반환 %, 요청 %, 매칭 %)', got, r_status, m_status;
  end if;
  raise notice 'PASS: cancel_care_request 는 요청과 살아 있던 매칭을 함께 취소한다';
end $$;

do $$
begin
  if public.cancel_care_request('40000000-0000-4000-8000-000000000206') is not null then
    raise exception 'FAIL: 이미 취소된 요청을 다시 취소하면 null 이다';
  end if;
  raise notice 'PASS: 이미 취소된 요청을 다시 취소하면 null 이다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

do $$
begin
  if public.cancel_care_request('40000000-0000-4000-8000-000000000207') is not null then
    raise exception 'FAIL: 남의 요청은 취소할 수 없다 (null)';
  end if;
  raise notice 'PASS: 남의 요청은 취소할 수 없다 (null)';
end $$;

-- 66) 간병 기록이 붙은 요청은 지우지 않는다 ------------------------------------

reset role;
set local request.jwt.claims to '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

do $$
declare
  n integer;
begin
  delete from public.care_requests where id = '40000000-0000-4000-8000-000000000207';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL: 매칭이 붙은 적 없는 대기중 요청은 지울 수 있다 (지운 행 %)', n;
  end if;
  raise notice 'PASS: 매칭이 붙은 적 없는 대기중 요청은 지울 수 있다';
end $$;

-- 지워지면 시작 전 취소 기록이 cascade 로 함께 사라진다. 노쇼 뒤 대기중 요청도 같은 경우다.
do $$
declare
  n integer;
  r_left integer;
  m_left integer;
begin
  delete from public.care_requests where id = '40000000-0000-4000-8000-000000000205';
  get diagnostics n = row_count;
  select count(*) into r_left from public.care_requests r where r.id = '40000000-0000-4000-8000-000000000205';
  select count(*) into m_left from public.matches m where m.request_id = '40000000-0000-4000-8000-000000000205';
  if n <> 0 or r_left <> 1 or m_left <> 1 then
    raise exception 'FAIL: 기록이 붙은 대기중 요청은 지워지지 않는다 (지운 행 %, 요청 %, 매칭 %)', n, r_left, m_left;
  end if;
  raise notice 'PASS: 기록이 붙은 대기중 요청은 지워지지 않는다';
end $$;

-- 67) 환자 정보는 지우되 간병 기록은 남긴다 -----------------------------------

do $$
begin
  perform set_config('test.p1_result', coalesce(public.remove_patient('40000000-0000-4000-8000-000000000101'), 'null'), false);
  perform set_config('test.p2_result', coalesce(public.remove_patient('40000000-0000-4000-8000-000000000102'), 'null'), false);
end $$;

-- 지운 환자는 보호자에게 보이지 않는다
do $$
declare
  visible integer;
begin
  select count(*) into visible from public.patients p where p.id = '40000000-0000-4000-8000-000000000102';
  if visible <> 0 then
    raise exception 'FAIL: 익명화한 환자는 보호자 목록에서 빠진다 (보이는 행 %)', visible;
  end if;
  raise notice 'PASS: 익명화한 환자는 보호자 목록에서 빠진다';
end $$;

do $$
begin
  if public.remove_patient('40000000-0000-4000-8000-000000000102') is not null then
    raise exception 'FAIL: 이미 지운 환자를 다시 지우면 null 이다';
  end if;
  raise notice 'PASS: 이미 지운 환자를 다시 지우면 null 이다';
end $$;

-- 간병인이 지금 보고 있는 환자 정보가 사라지면 안 된다
do $$
declare
  rejected boolean := false;
  still text;
begin
  begin
    perform public.remove_patient('40000000-0000-4000-8000-000000000103');
  exception when others then
    if sqlstate <> '22023' then
      raise exception 'FAIL: 진행 중인 간병이 있는 환자는 지울 수 없다 (예상 22023, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  select p.name into still from public.patients p where p.id = '40000000-0000-4000-8000-000000000103';
  if not rejected or still is distinct from '세나환자' then
    raise exception 'FAIL: 진행 중인 간병이 있는 환자는 지울 수 없다 (거부 %, 이름 %)', rejected, still;
  end if;
  raise notice 'PASS: 진행 중인 간병이 있는 환자는 지울 수 없다 (22023)';
end $$;

do $$
begin
  perform set_config('test.p4_result', coalesce(public.remove_patient('40000000-0000-4000-8000-000000000104'), 'null'), false);
end $$;

-- 지운 환자로 새 요청을 올릴 수 없다
do $$
declare
  rejected boolean := false;
begin
  begin
    insert into public.care_requests (guardian_id, patient_id, request_text, care_type, region, start_date)
    values ('40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000102',
            '지운 환자로 새 요청을 올려 봅니다', 'hospital', '서울 강남구', (now() at time zone 'Asia/Seoul')::date);
  exception when others then
    if sqlstate <> '42501' then
      raise exception 'FAIL: 지운 환자로는 새 요청을 올릴 수 없다 (예상 42501, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 지운 환자로는 새 요청을 올릴 수 없다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 지운 환자로는 새 요청을 올릴 수 없다 (42501)';
end $$;

-- 보호자가 deleted_at 을 비워 되살리거나, 기록이 있는 환자를 테이블에서 직접 지울 수 없다
do $$
declare
  restored integer;
  deleted integer;
begin
  update public.patients set deleted_at = null where id = '40000000-0000-4000-8000-000000000102';
  get diagnostics restored = row_count;
  delete from public.patients where id = '40000000-0000-4000-8000-000000000103';
  get diagnostics deleted = row_count;
  if restored <> 0 or deleted <> 0 then
    raise exception 'FAIL: 지운 환자를 되살리거나 기록이 있는 환자를 직접 지울 수 없다 (되살린 행 %, 지운 행 %)', restored, deleted;
  end if;
  raise notice 'PASS: 지운 환자를 되살리거나 기록이 있는 환자를 직접 지울 수 없다';
end $$;

reset role;
set local request.jwt.claims to '';

do $$
declare
  p1_left integer;
  r1_left integer;
begin
  select count(*) into p1_left from public.patients p where p.id = '40000000-0000-4000-8000-000000000101';
  select count(*) into r1_left from public.care_requests r where r.id = '40000000-0000-4000-8000-000000000201';
  if current_setting('test.p1_result') <> 'deleted' or p1_left <> 0 or r1_left <> 0 then
    raise exception 'FAIL: 기록이 없는 환자는 요청까지 행째 지운다 (반환 %, 환자 %, 요청 %)',
      current_setting('test.p1_result'), p1_left, r1_left;
  end if;
  raise notice 'PASS: 기록이 없는 환자는 요청까지 행째 지운다 (deleted)';
end $$;

do $$
declare
  p public.patients%rowtype;
  r2_left integer;
  r3_left integer;
  m2_left integer;
begin
  select * into p from public.patients x where x.id = '40000000-0000-4000-8000-000000000102';
  select count(*) into r2_left from public.care_requests r where r.id = '40000000-0000-4000-8000-000000000202';
  select count(*) into r3_left from public.care_requests r where r.id = '40000000-0000-4000-8000-000000000203';
  select count(*) into m2_left from public.matches m where m.id = current_setting('test.m2')::uuid;
  if current_setting('test.p2_result') <> 'anonymized'
     or p.id is null or p.name <> '삭제된 환자' or p.relationship is not null
     or p.conditions <> '{}' or p.care_notes is not null or p.deleted_at is null then
    raise exception 'FAIL: 기록이 있는 환자는 행을 남기고 이름·관계·질환·특이사항을 지운다 (반환 %, 이름 %, 관계 %, 질환 %, 특이사항 %, 지운 시각 %)',
      current_setting('test.p2_result'), p.name, p.relationship, p.conditions, p.care_notes, p.deleted_at;
  end if;
  raise notice 'PASS: 기록이 있는 환자는 행을 남기고 이름·관계·질환·특이사항을 지운다 (anonymized)';

  if r2_left <> 1 or m2_left <> 1 or r3_left <> 0 then
    raise exception 'FAIL: 익명화할 때 기록이 붙은 요청과 매칭은 남고, 손대지 않은 요청만 지워진다 (R2 %, 매칭 %, R3 %)', r2_left, m2_left, r3_left;
  end if;
  raise notice 'PASS: 익명화할 때 기록이 붙은 요청과 매칭은 남고, 손대지 않은 요청만 지워진다';
end $$;

-- 대기중으로 남겨 두면 지운 환자의 요청에 다시 간병인이 붙는다
do $$
declare
  r5_status text;
begin
  select r.status into r5_status from public.care_requests r where r.id = '40000000-0000-4000-8000-000000000205';
  if current_setting('test.p4_result') <> 'anonymized' or r5_status <> 'cancelled' then
    raise exception 'FAIL: 기록이 붙은 대기중 요청은 환자를 익명화할 때 취소로 닫힌다 (반환 %, R5 %)',
      current_setting('test.p4_result'), r5_status;
  end if;
  raise notice 'PASS: 기록이 붙은 대기중 요청은 환자를 익명화할 때 취소로 닫힌다';
end $$;

-- 68) 요청 원문은 수락한 간병인에게만 -----------------------------------------

set local request.jwt.claims to '{"sub":"40000000-0000-4000-8000-000000000003","role":"authenticated"}';
set local role authenticated;

do $$
declare
  txt text;
  place text;
begin
  select v.request_text, v.care_type into txt, place
  from public.caregiver_care_requests v where v.id = '40000000-0000-4000-8000-000000000208';
  if place is null or txt is not null then
    raise exception 'FAIL: 수락 전 간병인에게 요청 원문은 비어 있고 조건은 보인다 (원문 %, 장소 %)', txt, place;
  end if;
  raise notice 'PASS: 수락 전 간병인에게 요청 원문은 비어 있고 조건은 보인다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

do $$
declare
  txt text;
begin
  if public.accept_care_request('40000000-0000-4000-8000-000000000208') is null then
    raise exception 'FAIL: [준비] 간병인 C1 이 R8 을 수락하지 못했다';
  end if;
  select v.request_text into txt from public.caregiver_care_requests v where v.id = '40000000-0000-4000-8000-000000000208';
  if txt is distinct from '정환자 강남세브란스 7층입니다 (R8 원문)' then
    raise exception 'FAIL: 수락한 간병인에게는 요청 원문이 보인다 (실제 %)', txt;
  end if;
  raise notice 'PASS: 수락한 간병인에게는 요청 원문이 보인다';
end $$;

-- 69) 끝난 간병의 연락처는 30일 뒤 닫는다 --------------------------------------

do $$
declare
  d public.match_details%rowtype;
begin
  select * into d from public.match_details x where x.id = current_setting('test.m9')::uuid;
  if d.guardian_phone is distinct from '010-1111-2222' or d.request_text is null or d.patient_care_notes is null then
    raise exception 'FAIL: 끝난 지 얼마 안 된 간병은 연락처·원문·특이사항이 열려 있다 (전화 %, 원문 %, 특이사항 %)',
      d.guardian_phone, d.request_text, d.patient_care_notes;
  end if;
  raise notice 'PASS: 끝난 지 얼마 안 된 간병은 연락처·원문·특이사항이 열려 있다';
end $$;

reset role;
set local request.jwt.claims to '';

update public.matches set completed_at = now() - interval '31 days' where id = current_setting('test.m9')::uuid;

set local request.jwt.claims to '{"sub":"40000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

do $$
declare
  d public.match_details%rowtype;
begin
  select * into d from public.match_details x where x.id = current_setting('test.m9')::uuid;
  if d.guardian_phone is not null or d.guardian_name is distinct from public.mask_person_name('박보호')
     or d.request_text is not null or d.patient_care_notes is not null
     or d.patient_name is distinct from public.mask_person_name('정환자') then
    raise exception 'FAIL: 종료 30일이 지나면 간병인에게 연락처·이름·원문·특이사항이 다시 가려진다 (전화 %, 이름 %, 원문 %, 특이사항 %, 환자 %)',
      d.guardian_phone, d.guardian_name, d.request_text, d.patient_care_notes, d.patient_name;
  end if;
  raise notice 'PASS: 종료 30일이 지나면 간병인에게 연락처·이름·원문·특이사항이 다시 가려진다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

do $$
declare
  d public.match_details%rowtype;
begin
  select * into d from public.match_details x where x.id = current_setting('test.m9')::uuid;
  if d.patient_name is distinct from '정환자' or d.request_text is null or d.caregiver_phone is not null then
    raise exception 'FAIL: 30일이 지나도 보호자에게 자기 환자와 원문은 보이고, 간병인 연락처는 닫힌다 (환자 %, 원문 %, 간병인 전화 %)',
      d.patient_name, d.request_text, d.caregiver_phone;
  end if;
  raise notice 'PASS: 30일이 지나도 보호자에게 자기 환자와 원문은 보이고, 간병인 연락처는 닫힌다';
end $$;

-- 끝 ---------------------------------------------------------------------------

reset role;
set local request.jwt.claims to '';

do $$
begin
  raise notice '04_privacy_and_history: 모든 검사 통과 (21개)';
end $$;

rollback;
