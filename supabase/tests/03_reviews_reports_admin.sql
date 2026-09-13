-- 03) 후기 · 신고 · 관리자 조치 · 감사 로그 검증
--
-- schema.sql 30) create_review, 52)~56) 지운 표시·읽기 경로·신고, 57)~63) 관리자 함수와
-- admin_actions 를 확인한다.
-- 실행 방법과 출력 읽는 법은 supabase/tests/README.md 를 본다.
--
-- 02 가 함수로 밟은 매칭 흐름은 여기서 되풀이하지 않는다. 매칭은 운영자 권한으로 상태를 바로 심는다.
--
-- 등장인물 (id 고정 · rollback 으로 사라진다)
--   보호자 G   30000000-0000-4000-8000-000000000001
--   간병인 C   30000000-0000-4000-8000-000000000002
--   간병인 C2  30000000-0000-4000-8000-000000000003
--   외부인 X   30000000-0000-4000-8000-000000000004  (다른 보호자)
--   관리자 A   30000000-0000-4000-8000-000000000005
--   환자 P     30000000-0000-4000-8000-000000000101
--
--   요청 / 매칭                                         상태
--   R1 ...201 / M1 ...301  G·C                         completed  — 후기 대상
--   R2 ...202 / M2 ...302  G·C  종료일 그저께           accepted   — 방치(overdue), 시작 전 강제 취소
--   R3 ...203 / M3 ...303  G·C                         no_show    — 노쇼 되돌리기
--   R4 ...204 / M4 ...304  G·C2 종료일 없음             in_progress — 시작 후 강제 취소
--   R6 ...206 / M6 ...306  G·C                         completed  — 미리 심은 5점 후기 ...406
--   R7 ...207              G    매칭 없음              pending    — 추천 후보 확인용

begin;

-- 0) 준비 --------------------------------------------------------------------

set local request.jwt.claim.sub to '';
set local request.jwt.claims to '';
reset role;

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 't03-guardian@example.test', '',
   '{"provider":"email","providers":["email"]}', '{"name":"김보호","role":"guardian"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 't03-caregiver@example.test', '',
   '{"provider":"email","providers":["email"]}', '{"name":"이간병","role":"caregiver"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 't03-caregiver2@example.test', '',
   '{"provider":"email","providers":["email"]}', '{"name":"최간병","role":"caregiver"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000004',
   'authenticated', 'authenticated', 't03-outsider@example.test', '',
   '{"provider":"email","providers":["email"]}', '{"name":"정외부","role":"guardian"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-4000-8000-000000000005',
   'authenticated', 'authenticated', 't03-admin@example.test', '',
   '{"provider":"email","providers":["email"]}', '{"name":"박관리","role":"guardian"}', now(), now());

-- claims 가 비어 있어 auth.uid() 가 null 이므로 가드 트리거가 통과시킨다 (schema.sql 51)
update public.profiles set role = 'admin' where id = '30000000-0000-4000-8000-000000000005';

-- 경력을 최댓값(60)으로 두어 추천의 limit 50 안에 들게 한다
insert into public.caregiver_profiles (id, gender, years_of_experience, care_types, regions)
values
  ('30000000-0000-4000-8000-000000000002', 'female', 60, '{hospital}', '{서울 강남구}'),
  ('30000000-0000-4000-8000-000000000003', 'female', 60, '{hospital}', '{서울 강남구}');

insert into public.patients (id, guardian_id, name, birth_year, gender, mobility)
values ('30000000-0000-4000-8000-000000000101', '30000000-0000-4000-8000-000000000001',
        '박환자', 1940, 'female', 'assisted');

insert into public.care_requests
  (id, guardian_id, patient_id, request_text, care_type, region, start_date, end_date,
   status, matched_caregiver_id, matched_at)
select
  x.id::uuid, '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000101',
  x.request_text, 'hospital', '서울 강남구', t.today + x.start_offset, t.today + x.end_offset,
  x.status, x.caregiver::uuid, case when x.caregiver is null then null else now() end
from (select (now() at time zone 'Asia/Seoul')::date as today) t
cross join (values
  ('30000000-0000-4000-8000-000000000201', '후기 대상 간병 요청입니다', -10, -3,   'completed',   '30000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000202', '방치된 매칭 간병 요청입니다', -10, -2, 'matched',     '30000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000203', '노쇼 신고된 간병 요청입니다', -1, null, 'pending',     null),
  ('30000000-0000-4000-8000-000000000204', '진행 중인 간병 요청입니다', -1, null,   'in_progress', '30000000-0000-4000-8000-000000000003'),
  ('30000000-0000-4000-8000-000000000206', '예전에 끝난 간병 요청입니다', -30, -20, 'completed',   '30000000-0000-4000-8000-000000000002'),
  ('30000000-0000-4000-8000-000000000207', '새로 올린 간병 요청입니다', 3, null,     'pending',     null)
) as x(id, request_text, start_offset, end_offset, status, caregiver);

insert into public.matches
  (id, request_id, guardian_id, caregiver_id, status, accepted_at, started_at, completed_at,
   no_show_at, no_show_reported_by, no_show_note)
values
  ('30000000-0000-4000-8000-000000000301', '30000000-0000-4000-8000-000000000201',
   '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
   'completed', now() - interval '11 days', now() - interval '10 days', now() - interval '3 days', null, null, null),
  ('30000000-0000-4000-8000-000000000302', '30000000-0000-4000-8000-000000000202',
   '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
   'accepted', now() - interval '11 days', null, null, null, null, null),
  ('30000000-0000-4000-8000-000000000303', '30000000-0000-4000-8000-000000000203',
   '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
   'no_show', now() - interval '2 days', null, null, now(), '30000000-0000-4000-8000-000000000001', '오지 않음'),
  ('30000000-0000-4000-8000-000000000304', '30000000-0000-4000-8000-000000000204',
   '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000003',
   'in_progress', now() - interval '2 days', now() - interval '1 day', null, null, null, null),
  ('30000000-0000-4000-8000-000000000306', '30000000-0000-4000-8000-000000000206',
   '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002',
   'completed', now() - interval '31 days', now() - interval '30 days', now() - interval '20 days', null, null, null);

-- C 가 받은 후기를 하나 더 심어 둔다. 한 개뿐이면 지운 뒤 평균이 "없음"이 되어 무엇이 빠졌는지 가려진다.
insert into public.reviews (id, match_id, reviewer_id, reviewee_id, rating, comment)
values ('30000000-0000-4000-8000-000000000406', '30000000-0000-4000-8000-000000000306',
        '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 5, '예전 간병 좋았습니다');

-- 1) 후기 쓰기 -------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

-- 진행 중인 간병을 평가하면 남은 기간에 그대로 영향을 준다.
do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.create_review('30000000-0000-4000-8000-000000000304', 5::smallint, '아직 진행 중');
  exception when others then
    if sqlstate <> '22023' then
      raise exception 'FAIL: 끝나지 않은 매칭에는 후기를 쓸 수 없다 (예상 22023, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 끝나지 않은 매칭에는 후기를 쓸 수 없다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 끝나지 않은 매칭에는 후기를 쓸 수 없다 (22023)';
end $$;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.create_review('30000000-0000-4000-8000-000000000301', 6::smallint, '별점 초과');
  exception when others then
    if sqlstate <> '23514' then
      raise exception 'FAIL: 별점은 1~5 만 받는다 (예상 23514, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 별점은 1~5 만 받는다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 별점은 1~5 만 받는다 (23514)';
end $$;

-- 후기의 입구는 "함께한 간병 한 건"이다. reviewee 는 앱이 아니라 함수가 매칭에서 정한다.
do $$
declare
  got uuid;
  rv public.reviews%rowtype;
begin
  got := public.create_review('30000000-0000-4000-8000-000000000301', 2::smallint, '  시간을 자주 어겼습니다  ');
  select * into rv from public.reviews r where r.id = got;
  if got is null
     or rv.reviewee_id is distinct from '30000000-0000-4000-8000-000000000002'
     or rv.comment is distinct from '시간을 자주 어겼습니다' then
    raise exception 'FAIL: 보호자는 끝난 매칭에 후기를 쓰고, 상대는 매칭의 간병인으로 정해진다 (id %, reviewee %, comment %)',
      got, rv.reviewee_id, rv.comment;
  end if;
  perform set_config('test.review_g', got::text, false);
  raise notice 'PASS: 보호자는 끝난 매칭에 후기를 쓰고, 상대는 매칭의 간병인으로 정해진다';
end $$;

do $$
declare
  got uuid;
  mine integer;
begin
  got := public.create_review('30000000-0000-4000-8000-000000000301', 5::smallint, '다시 쓰기');
  select count(*) into mine from public.reviews r
  where r.match_id = '30000000-0000-4000-8000-000000000301'
    and r.reviewer_id = '30000000-0000-4000-8000-000000000001';
  if got is not null or mine <> 1 then
    raise exception 'FAIL: 한 매칭에 한 사람은 후기를 한 번만 쓴다 (반환 %, 행 %)', got, mine;
  end if;
  raise notice 'PASS: 한 매칭에 한 사람은 후기를 한 번만 쓴다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000004","role":"authenticated"}';
set local role authenticated;

-- 없는 매칭과 남의 매칭을 구분해 알려 주지 않는다 — 예외가 아니라 null 이다.
do $$
declare
  got uuid;
begin
  got := public.create_review('30000000-0000-4000-8000-000000000301', 1::smallint, '남의 매칭');
  if got is not null then
    raise exception 'FAIL: 매칭 당사자가 아니면 후기를 쓸 수 없다 (실제 %)', got;
  end if;
  raise notice 'PASS: 매칭 당사자가 아니면 후기를 쓸 수 없다 (null)';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

do $$
declare
  got uuid;
begin
  got := public.create_review('30000000-0000-4000-8000-000000000301', 4::smallint, '친절한 보호자였습니다');
  if got is null then
    raise exception 'FAIL: 간병인도 같은 매칭에 보호자에 대한 후기를 한 줄 쓸 수 있다';
  end if;
  perform set_config('test.review_c', got::text, false);
  raise notice 'PASS: 간병인도 같은 매칭에 보호자에 대한 후기를 한 줄 쓸 수 있다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

-- 지우기 전의 기준값. C 가 받은 후기는 2점(review_g)과 5점(...406) 두 개다.
do $$
declare
  avg_rating numeric;
  cnt integer;
  cand_avg numeric;
  cand_cnt integer;
begin
  select u.rating_avg, u.review_count into avg_rating, cnt
  from public.user_ratings u where u.user_id = '30000000-0000-4000-8000-000000000002';
  select c.rating_avg, c.review_count into cand_avg, cand_cnt
  from public.recommendation_candidates('30000000-0000-4000-8000-000000000207') c
  where c.caregiver_id = '30000000-0000-4000-8000-000000000002';
  if avg_rating is distinct from 3.50 or cnt is distinct from 2
     or cand_avg is distinct from 3.50 or cand_cnt is distinct from 2
     or not exists (select 1 from public.public_reviews('30000000-0000-4000-8000-000000000002') p
                    where p.id = current_setting('test.review_g')::uuid) then
    raise exception 'FAIL: [기준] 지우기 전 평균·목록·추천에 후기가 모두 반영된다 (평균 %/%, 추천 %/%)',
      avg_rating, cnt, cand_avg, cand_cnt;
  end if;
  raise notice 'PASS: [기준] 지우기 전 평균·목록·추천에 후기가 모두 반영된다';
end $$;

-- 2) 후기 신고 -------------------------------------------------------------------

reset role;
set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000004","role":"authenticated"}';
set local role authenticated;

-- 당사자가 아닌 신고는 큐만 불린다. 후기가 있는지조차 알려 주지 않는다.
do $$
declare
  got uuid;
begin
  got := public.report_review(current_setting('test.review_g')::uuid, 'abuse', '제3자 신고');
  if got is not null then
    raise exception 'FAIL: 후기 당사자가 아니면 신고할 수 없다 (실제 %)', got;
  end if;
  raise notice 'PASS: 후기 당사자가 아니면 신고할 수 없다 (null)';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.report_review(current_setting('test.review_g')::uuid, 'rude', null);
  exception when others then
    if sqlstate <> '23514' then
      raise exception 'FAIL: 정해진 신고 사유가 아니면 거부된다 (예상 23514, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 정해진 신고 사유가 아니면 거부된다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 정해진 신고 사유가 아니면 거부된다 (23514)';
end $$;

-- 평가받은 사람은 자기 신뢰도에 남는 기록이라 신고할 자리가 있어야 한다.
do $$
declare
  got uuid;
  rep public.review_reports%rowtype;
begin
  got := public.report_review(current_setting('test.review_g')::uuid, 'false_info', '  사실과 다릅니다  ');
  select * into rep from public.review_reports rr where rr.id = got;
  if got is null or rep.status <> 'open' or rep.reason <> 'false_info'
     or rep.detail is distinct from '사실과 다릅니다' or rep.resolved_at is not null then
    raise exception 'FAIL: 후기를 받은 당사자는 신고할 수 있고 신고는 open 으로 남는다 (id %, 상태 %)', got, rep.status;
  end if;
  perform set_config('test.report_c', got::text, false);
  raise notice 'PASS: 후기를 받은 당사자는 신고할 수 있고 신고는 open 으로 남는다';
end $$;

do $$
declare
  got uuid;
  mine integer;
begin
  got := public.report_review(current_setting('test.review_g')::uuid, 'abuse', '한 번 더');
  select count(*) into mine from public.review_reports rr
  where rr.review_id = current_setting('test.review_g')::uuid;
  if got is not null or mine <> 1 then
    raise exception 'FAIL: 같은 후기를 두 번 신고하면 null 이고 줄이 늘지 않는다 (반환 %, 행 %)', got, mine;
  end if;
  raise notice 'PASS: 같은 후기를 두 번 신고하면 null 이고 줄이 늘지 않는다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

-- 신고 기각 검사에 쓸 신고를 하나 더 만든다. 보호자가 자기가 받은 후기(review_c)를 신고한다.
do $$
declare
  got uuid;
begin
  got := public.report_review(current_setting('test.review_c')::uuid, 'spam', null);
  if got is null then
    raise exception 'FAIL: 보호자도 자기가 받은 후기를 신고할 수 있다';
  end if;
  perform set_config('test.report_g', got::text, false);
  raise notice 'PASS: 보호자도 자기가 받은 후기를 신고할 수 있다';
end $$;

-- 3) 관리자 — 신고 큐와 후기 지우기 -------------------------------------------------

reset role;
set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated"}';
set local role authenticated;

-- 판단에 필요한 것은 신고·후기·사람을 이어 붙인 한 줄이다.
-- (open 신고가 100건을 넘게 쌓인 프로젝트라면 limit 100 에 밀려 실패할 수 있다.)
do $$
declare
  q record;
begin
  select * into q from public.admin_review_reports('open') x
  where x.report_id = current_setting('test.report_c')::uuid;
  if q.report_id is null
     or q.review_id is distinct from current_setting('test.review_g')::uuid
     or q.report_count <> 1
     or q.reviewer_id is distinct from '30000000-0000-4000-8000-000000000001'
     or q.reviewee_id is distinct from '30000000-0000-4000-8000-000000000002'
     or q.review_deleted_at is not null
     or not exists (select 1 from public.admin_review_reports('open') x
                    where x.report_id = current_setting('test.report_g')::uuid) then
    raise exception 'FAIL: 관리자 신고 큐에 open 신고가 후기·작성자·대상과 함께 나온다';
  end if;
  raise notice 'PASS: 관리자 신고 큐에 open 신고가 후기·작성자·대상과 함께 나온다';
end $$;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform 1 from public.admin_review_reports('closed');
  exception when others then
    if sqlstate <> '23514' then
      raise exception 'FAIL: 신고 큐는 open·accepted·dismissed 외의 상태를 거부한다 (예상 23514, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 신고 큐는 open·accepted·dismissed 외의 상태를 거부한다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 신고 큐는 open·accepted·dismissed 외의 상태를 거부한다 (23514)';
end $$;

do $$
declare
  got uuid;
begin
  got := public.admin_delete_review(current_setting('test.review_g')::uuid, '  허위 후기로 판단  ');
  if got is distinct from current_setting('test.review_g')::uuid then
    raise exception 'FAIL: 관리자가 후기를 지우면 후기 id 를 돌려받는다 (실제 %)', got;
  end if;
  raise notice 'PASS: 관리자가 후기를 지우면 후기 id 를 돌려받는다';
end $$;

-- 목록을 띄워 둔 사이 다른 관리자가 먼저 지운 경우다. 오류가 아니라 "지울 것이 없다"이고 로그도 남지 않아야 한다.
do $$
declare
  got uuid;
begin
  got := public.admin_delete_review(current_setting('test.review_g')::uuid, '두 번째 삭제');
  if got is not null then
    raise exception 'FAIL: 이미 지운 후기를 다시 지우면 null 이다 (실제 %)', got;
  end if;
  raise notice 'PASS: 이미 지운 후기를 다시 지우면 null 이다';
end $$;

reset role;
set local request.jwt.claims to '';

-- 행을 실제로 지우지 않고 표시만 한다. 그 후기의 열린 신고는 accepted 로 함께 마감되고,
-- 다른 후기(review_c)에 달린 신고는 건드리지 않는다.
do $$
declare
  rv public.reviews%rowtype;
  rep public.review_reports%rowtype;
  other_status text;
begin
  select * into rv from public.reviews r where r.id = current_setting('test.review_g')::uuid;
  select * into rep from public.review_reports rr where rr.id = current_setting('test.report_c')::uuid;
  select rr.status into other_status from public.review_reports rr where rr.id = current_setting('test.report_g')::uuid;
  if rv.id is null or rv.deleted_at is null
     or rv.deleted_by is distinct from '30000000-0000-4000-8000-000000000005'
     or rv.deleted_reason is distinct from '허위 후기로 판단'
     or rep.status <> 'accepted' or rep.resolved_at is null
     or rep.resolved_by is distinct from '30000000-0000-4000-8000-000000000005'
     or rep.resolution_note is distinct from '허위 후기로 판단'
     or other_status <> 'open' then
    raise exception 'FAIL: 지운 후기는 행이 남아 deleted_* 가 채워지고 열린 신고는 accepted 가 된다 (신고 %, 다른 신고 %)',
      rep.status, other_status;
  end if;
  raise notice 'PASS: 지운 후기는 행이 남아 deleted_* 가 채워지고 열린 신고는 accepted 가 된다';
end $$;

set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

-- 읽는 경로 셋이 모두 같은 조건을 써야 한다. 한 곳이라도 빠지면 목록에는 없는데 평균에는 남는다.
do $$
declare
  avg_rating numeric;
  cnt integer;
  cand_avg numeric;
  cand_cnt integer;
begin
  select u.rating_avg, u.review_count into avg_rating, cnt
  from public.user_ratings u where u.user_id = '30000000-0000-4000-8000-000000000002';
  select c.rating_avg, c.review_count into cand_avg, cand_cnt
  from public.recommendation_candidates('30000000-0000-4000-8000-000000000207') c
  where c.caregiver_id = '30000000-0000-4000-8000-000000000002';
  if avg_rating is distinct from 5.00 or cnt is distinct from 1 then
    raise exception 'FAIL: 지운 후기는 user_ratings 평균과 개수에서 빠진다 (평균 %, 개수 %)', avg_rating, cnt;
  end if;
  if exists (select 1 from public.public_reviews('30000000-0000-4000-8000-000000000002') p
             where p.id = current_setting('test.review_g')::uuid)
     or not exists (select 1 from public.public_reviews('30000000-0000-4000-8000-000000000002') p
                    where p.id = '30000000-0000-4000-8000-000000000406') then
    raise exception 'FAIL: 지운 후기는 public_reviews() 에서 빠지고 나머지는 남는다';
  end if;
  if cand_avg is distinct from 5.00 or cand_cnt is distinct from 1 then
    raise exception 'FAIL: 지운 후기는 recommendation_candidates() 의 별점에서도 빠진다 (평균 %, 개수 %)', cand_avg, cand_cnt;
  end if;
  raise notice 'PASS: 지운 후기는 user_ratings · public_reviews() · recommendation_candidates() 모두에서 빠진다';
end $$;

-- 삭제가 곧 다시 쓸 기회가 되면 막아 둔 "후기 수정"이 삭제→재작성으로 우회된다.
do $$
declare
  got uuid;
begin
  got := public.create_review('30000000-0000-4000-8000-000000000301', 5::smallint, '지워졌으니 다시 쓰기');
  if got is not null then
    raise exception 'FAIL: 후기가 지워져도 작성자는 같은 매칭에 다시 쓸 수 없다 (실제 %)', got;
  end if;
  raise notice 'PASS: 후기가 지워져도 작성자는 같은 매칭에 다시 쓸 수 없다 (null)';
end $$;

do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.report_review(current_setting('test.review_g')::uuid, 'other', '지운 후기 신고');
  exception when others then
    if sqlstate <> '22023' then
      raise exception 'FAIL: 지워진 후기는 신고할 수 없다 (예상 22023, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 지워진 후기는 신고할 수 없다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 지워진 후기는 신고할 수 없다 (22023)';
end $$;

-- "후기 당사자 조회" 정책은 일부러 걸러내지 않는다 (schema.sql 54). 자기 후기가 왜 사라졌는지는 본인에게 보여야 한다.
do $$
begin
  if not exists (select 1 from public.reviews r
                 where r.id = current_setting('test.review_g')::uuid and r.deleted_at is not null) then
    raise exception 'FAIL: 작성자는 지워진 자기 후기를 삭제 표시와 함께 볼 수 있다';
  end if;
  raise notice 'PASS: 작성자는 지워진 자기 후기를 삭제 표시와 함께 볼 수 있다';
end $$;

-- 4) 관리자 — 후기 되돌리기와 신고 기각 --------------------------------------------

reset role;
set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated"}';
set local role authenticated;

do $$
declare
  got uuid;
  again uuid;
begin
  got := public.admin_restore_review(current_setting('test.review_g')::uuid, '재검토 결과 되돌림');
  again := public.admin_restore_review(current_setting('test.review_g')::uuid, '두 번째 되돌리기');
  if got is distinct from current_setting('test.review_g')::uuid or again is not null then
    raise exception 'FAIL: 지운 후기는 한 번 되돌릴 수 있고, 지워지지 않은 후기를 되돌리면 null 이다 (첫 %, 둘째 %)', got, again;
  end if;
  raise notice 'PASS: 지운 후기는 한 번 되돌릴 수 있고, 지워지지 않은 후기를 되돌리면 null 이다';
end $$;

reset role;
set local request.jwt.claims to '';

-- accepted 로 남겨 두면 "지웠다"고 읽힌다. 후기가 돌아왔으면 그 신고는 기각이다.
do $$
declare
  rv public.reviews%rowtype;
  rep public.review_reports%rowtype;
begin
  select * into rv from public.reviews r where r.id = current_setting('test.review_g')::uuid;
  select * into rep from public.review_reports rr where rr.id = current_setting('test.report_c')::uuid;
  if rv.deleted_at is not null or rv.deleted_by is not null or rv.deleted_reason is not null
     or rep.status <> 'dismissed'
     or rep.resolved_by is distinct from '30000000-0000-4000-8000-000000000005'
     or rep.resolution_note is distinct from '재검토 결과 되돌림' then
    raise exception 'FAIL: 되돌리면 deleted_* 가 비워지고 accepted 신고는 dismissed 가 된다 (신고 %)', rep.status;
  end if;
  raise notice 'PASS: 되돌리면 deleted_* 가 비워지고 accepted 신고는 dismissed 가 된다';
end $$;

set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000001","role":"authenticated"}';
set local role authenticated;

do $$
declare
  avg_rating numeric;
  cnt integer;
begin
  select u.rating_avg, u.review_count into avg_rating, cnt
  from public.user_ratings u where u.user_id = '30000000-0000-4000-8000-000000000002';
  if avg_rating is distinct from 3.50 or cnt is distinct from 2
     or not exists (select 1 from public.public_reviews('30000000-0000-4000-8000-000000000002') p
                    where p.id = current_setting('test.review_g')::uuid) then
    raise exception 'FAIL: 되돌린 후기는 평균과 공개 목록에 다시 들어간다 (평균 %, 개수 %)', avg_rating, cnt;
  end if;
  raise notice 'PASS: 되돌린 후기는 평균과 공개 목록에 다시 들어간다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated"}';
set local role authenticated;

do $$
declare
  got uuid;
  again uuid;
begin
  got := public.admin_dismiss_report(current_setting('test.report_g')::uuid, '  근거 부족  ');
  again := public.admin_dismiss_report(current_setting('test.report_g')::uuid, '두 번째 기각');
  if got is distinct from current_setting('test.report_g')::uuid or again is not null then
    raise exception 'FAIL: 열린 신고는 한 번 기각할 수 있고, 이미 처리된 신고를 기각하면 null 이다 (첫 %, 둘째 %)', got, again;
  end if;
  raise notice 'PASS: 열린 신고는 한 번 기각할 수 있고, 이미 처리된 신고를 기각하면 null 이다';
end $$;

reset role;
set local request.jwt.claims to '';

do $$
declare
  rep public.review_reports%rowtype;
  review_deleted timestamptz;
begin
  select * into rep from public.review_reports rr where rr.id = current_setting('test.report_g')::uuid;
  select r.deleted_at into review_deleted from public.reviews r where r.id = current_setting('test.review_c')::uuid;
  if rep.status <> 'dismissed' or rep.resolved_at is null
     or rep.resolved_by is distinct from '30000000-0000-4000-8000-000000000005'
     or rep.resolution_note is distinct from '근거 부족'
     or review_deleted is not null then
    raise exception 'FAIL: 신고를 기각하면 신고만 dismissed 가 되고 후기는 그대로다 (신고 %)', rep.status;
  end if;
  raise notice 'PASS: 신고를 기각하면 신고만 dismissed 가 되고 후기는 그대로다';
end $$;

-- 5) 관리자 — 분쟁 매칭과 노쇼 되돌리기 ---------------------------------------------

set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated"}';
set local role authenticated;

-- 노쇼로 신고된 건과, 끝날 날이 지났는데 살아 있는 건만 나와야 한다.
-- (분쟁 매칭이 100건을 넘게 쌓인 프로젝트라면 limit 100 에 밀려 실패할 수 있다.)
do $$
declare
  m3_kind text;
  m2_kind text;
begin
  select d.kind into m3_kind from public.admin_disputed_matches() d where d.match_id = '30000000-0000-4000-8000-000000000303';
  select d.kind into m2_kind from public.admin_disputed_matches() d where d.match_id = '30000000-0000-4000-8000-000000000302';
  if m3_kind is distinct from 'no_show' or m2_kind is distinct from 'overdue' then
    raise exception 'FAIL: 분쟁 매칭에 노쇼(no_show)와 기한 지난 매칭(overdue)이 나온다 (M3 %, M2 %)', m3_kind, m2_kind;
  end if;
  if exists (select 1 from public.admin_disputed_matches() d
             where d.match_id in ('30000000-0000-4000-8000-000000000301',
                                  '30000000-0000-4000-8000-000000000304',
                                  '30000000-0000-4000-8000-000000000306')) then
    raise exception 'FAIL: 끝난 매칭과 종료일 없는 진행 중 매칭은 분쟁 매칭에 나오지 않는다';
  end if;
  raise notice 'PASS: 분쟁 매칭에는 노쇼와 기한 지난 매칭만 나온다';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

-- 전제 확인: 되돌리기 전에는 노쇼 간병인이 R3 를 다시 수락할 수 없다. 이게 막혀 있어야 뒤의 "다시 수락"이 뜻을 갖는다.
do $$
declare
  rejected boolean := false;
begin
  begin
    perform public.accept_care_request('30000000-0000-4000-8000-000000000203');
  exception when others then
    if sqlstate <> '22023' then
      raise exception 'FAIL: 노쇼를 되돌리기 전에는 그 간병인이 요청을 다시 수락할 수 없다 (예상 22023, 실제 % %)', sqlstate, sqlerrm;
    end if;
    rejected := true;
  end;
  if not rejected then
    raise exception 'FAIL: 노쇼를 되돌리기 전에는 그 간병인이 요청을 다시 수락할 수 없다 (거부되지 않음)';
  end if;
  raise notice 'PASS: 노쇼를 되돌리기 전에는 그 간병인이 요청을 다시 수락할 수 없다 (22023)';
end $$;

reset role;
set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated"}';
set local role authenticated;

do $$
declare
  wrong uuid;
  got uuid;
begin
  wrong := public.admin_clear_no_show('30000000-0000-4000-8000-000000000301', '노쇼 아닌 매칭');
  got := public.admin_clear_no_show('30000000-0000-4000-8000-000000000303', '  보호자 착오로 신고  ');
  if wrong is not null or got is distinct from '30000000-0000-4000-8000-000000000303' then
    raise exception 'FAIL: 노쇼 되돌리기는 no_show 매칭에만 된다 (완료 매칭 %, 노쇼 매칭 %)', wrong, got;
  end if;
  raise notice 'PASS: 노쇼 되돌리기는 no_show 매칭에만 된다';
end $$;

reset role;
set local request.jwt.claims to '';

-- accepted 로 되돌리면 그 사이 다른 간병인이 수락했을 때 살아 있는 매칭이 둘이 된다. 그래서 취소로 남기고,
-- 취소한 사람 자리에 관리자가 들어간다. 요청은 신고 시점에 이미 정리되었으므로 건드리지 않는다.
do $$
declare
  m public.matches%rowtype;
  req public.care_requests%rowtype;
begin
  select * into m from public.matches x where x.id = '30000000-0000-4000-8000-000000000303';
  select * into req from public.care_requests r where r.id = '30000000-0000-4000-8000-000000000203';
  if m.status <> 'cancelled' or m.cancelled_at is null
     or m.cancelled_by is distinct from '30000000-0000-4000-8000-000000000005'
     or m.cancel_reason is distinct from '보호자 착오로 신고'
     or m.no_show_at is not null or m.no_show_reported_by is not null or m.no_show_note is not null
     or req.status <> 'pending' or req.matched_caregiver_id is not null then
    raise exception 'FAIL: 노쇼를 되돌리면 매칭은 관리자가 취소한 것으로 남고 노쇼 표시와 요청은 그대로 정리된다 (매칭 %, 취소자 %, 요청 %)',
      m.status, m.cancelled_by, req.status;
  end if;
  raise notice 'PASS: 노쇼를 되돌리면 매칭은 관리자가 취소한 것으로 남고(cancelled_by = 관리자) 요청은 건드리지 않는다';
end $$;

set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000002","role":"authenticated"}';
set local role authenticated;

-- 신고가 잘못된 것이었다면 그 간병인은 같은 요청을 다시 가져갈 수 있어야 한다.
do $$
declare
  got uuid;
begin
  got := public.accept_care_request('30000000-0000-4000-8000-000000000203');
  if got is distinct from '30000000-0000-4000-8000-000000000203' then
    raise exception 'FAIL: 노쇼를 되돌리면 그 간병인이 같은 요청을 다시 수락할 수 있다 (실제 %)', got;
  end if;
  raise notice 'PASS: 노쇼를 되돌리면 그 간병인이 같은 요청을 다시 수락할 수 있다';
end $$;

-- 6) 관리자 — 매칭 강제 취소 ---------------------------------------------------------

reset role;
set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated"}';
set local role authenticated;

-- 끝난 매칭은 살아 있는 매칭이 아니므로 끊을 대상이 아니다. M2 는 시작 전, M4 는 시작 후다.
-- M4 의 사유는 공백뿐이라 null 로 저장되어야 한다.
do $$
declare
  done uuid;
  before_start uuid;
  after_start uuid;
begin
  done := public.admin_cancel_match('30000000-0000-4000-8000-000000000301', '끝난 매칭 취소 시도');
  before_start := public.admin_cancel_match('30000000-0000-4000-8000-000000000302', '  장기간 방치된 매칭  ');
  after_start := public.admin_cancel_match('30000000-0000-4000-8000-000000000304', '   ');
  if done is not null
     or before_start is distinct from '30000000-0000-4000-8000-000000000302'
     or after_start is distinct from '30000000-0000-4000-8000-000000000304' then
    raise exception 'FAIL: 관리자는 살아 있는 매칭만 강제 취소할 수 있다 (완료 %, 시작 전 %, 시작 후 %)',
      done, before_start, after_start;
  end if;
  raise notice 'PASS: 관리자는 살아 있는 매칭만 강제 취소할 수 있다';
end $$;

reset role;
set local request.jwt.claims to '';

-- 요청 처리는 cancel_match() 와 같은 규칙이어야 한다. 두 함수가 갈라지면 누가 취소했는지에 따라 요청 운명이 달라진다.
do $$
declare
  m2 public.matches%rowtype;
  m4 public.matches%rowtype;
  r2 public.care_requests%rowtype;
  r4 public.care_requests%rowtype;
begin
  select * into m2 from public.matches x where x.id = '30000000-0000-4000-8000-000000000302';
  select * into m4 from public.matches x where x.id = '30000000-0000-4000-8000-000000000304';
  select * into r2 from public.care_requests r where r.id = '30000000-0000-4000-8000-000000000202';
  select * into r4 from public.care_requests r where r.id = '30000000-0000-4000-8000-000000000204';
  if m2.status <> 'cancelled'
     or m2.cancelled_by is distinct from '30000000-0000-4000-8000-000000000005'
     or m2.cancel_reason is distinct from '장기간 방치된 매칭'
     or r2.status <> 'pending' or r2.matched_caregiver_id is not null or r2.matched_at is not null then
    raise exception 'FAIL: 시작 전 강제 취소는 요청을 pending 으로 다시 연다 (매칭 %, 요청 %)', m2.status, r2.status;
  end if;
  if m4.status <> 'cancelled'
     or m4.cancelled_by is distinct from '30000000-0000-4000-8000-000000000005'
     or m4.cancel_reason is not null
     or r4.status <> 'cancelled'
     or r4.matched_caregiver_id is distinct from '30000000-0000-4000-8000-000000000003' then
    raise exception 'FAIL: 시작 후 강제 취소는 요청을 cancelled 로 닫는다 (매칭 %, 요청 %, 사유 %)', m4.status, r4.status, m4.cancel_reason;
  end if;
  raise notice 'PASS: 강제 취소는 시작 전이면 요청을 다시 열고, 시작 후면 요청을 닫는다';
end $$;

-- 7) 감사 로그 ------------------------------------------------------------------------

set local request.jwt.claims to '{"sub":"30000000-0000-4000-8000-000000000005","role":"authenticated"}';
set local role authenticated;

-- 성공한 조치마다 정확히 한 줄, null 을 돌려준 헛손질은 한 줄도 남지 않아야 한다.
-- 노쇼 되돌리기는 매칭 행에 흔적이 남지 않으므로 여기 남은 한 줄이 유일한 기록이다.
-- 기대 목록과 실제 기록을 양쪽으로 빼 본다. except 는 null 끼리 같다고 보므로 note 가 null 인 줄도 짝이 맞고,
-- except all 이라 같은 줄이 두 번 남은 경우도 드러난다.
-- (temp 테이블은 authenticated 에 TEMP 권한이 없을 수 있어 쓰지 않는다)
do $$
declare
  logged_n integer;
  missing integer;
  extra integer;
begin
  with expected (action, target_type, target_id, note) as (
    values
      ('review_deleted',   'review',        current_setting('test.review_g')::uuid,       '허위 후기로 판단'::text),
      ('review_restored',  'review',        current_setting('test.review_g')::uuid,       '재검토 결과 되돌림'),
      ('report_dismissed', 'review_report', current_setting('test.report_g')::uuid,       '근거 부족'),
      ('no_show_cleared',  'match',         '30000000-0000-4000-8000-000000000303'::uuid, '보호자 착오로 신고'),
      ('match_cancelled',  'match',         '30000000-0000-4000-8000-000000000302'::uuid, '장기간 방치된 매칭'),
      ('match_cancelled',  'match',         '30000000-0000-4000-8000-000000000304'::uuid, null)
  ),
  actual as (
    select a.action, a.target_type, a.target_id, a.note
    from public.admin_actions a
    where a.admin_id = '30000000-0000-4000-8000-000000000005'
  )
  select
    (select count(*) from actual),
    (select count(*) from (select * from expected except all select * from actual) d),
    (select count(*) from (select * from actual except all select * from expected) d)
  into logged_n, missing, extra;

  if logged_n <> 6 or missing <> 0 or extra <> 0 then
    raise exception 'FAIL: admin_actions 에 성공한 조치마다 한 줄씩, 메모는 앞뒤 공백을 지워 남는다 (행 %, 빠짐 %, 남음 %)',
      logged_n, missing, extra;
  end if;
  raise notice 'PASS: admin_actions 에 성공한 조치마다 한 줄씩, 메모는 앞뒤 공백을 지워 남는다';
end $$;

-- 끝 ---------------------------------------------------------------------------

reset role;
set local request.jwt.claims to '';

do $$
begin
  raise notice '03_reviews_reports_admin: 모든 검사 통과 (34개)';
end $$;

rollback;
