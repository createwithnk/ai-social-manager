-- Run via the database admin connection. All synthetic data is rolled back.
begin;
select set_config('aasiflow_test.user_a',gen_random_uuid()::text,true),
       set_config('aasiflow_test.user_b',gen_random_uuid()::text,true),
       set_config('aasiflow_test.post_a',gen_random_uuid()::text,true);
insert into auth.users (id,email) values
(current_setting('aasiflow_test.user_a')::uuid,'aasiflow-test-a-' || current_setting('aasiflow_test.user_a') || '@example.invalid'),
(current_setting('aasiflow_test.user_b')::uuid,'aasiflow-test-b-' || current_setting('aasiflow_test.user_b') || '@example.invalid');
set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('aasiflow_test.user_a'),'role','authenticated')::text,true);
do $$
declare n integer; result boolean; denied boolean;
begin
  insert into public.posts(id,user_id,idea,platform,tone,caption,hashtags,status,media,language)
  values(current_setting('aasiflow_test.post_a')::uuid,auth.uid(),'Live database test','Instagram','Friendly','First test caption','{}','draft',null,'Urdu');
  select count(*) into n from public.posts;
  if n <> 1 then raise exception 'FAIL: user A sees unexpected posts'; end if;
  update public.posts set caption='Saved revised caption' where id=current_setting('aasiflow_test.post_a')::uuid;
  if not exists(select 1 from public.posts where caption='Saved revised caption') then raise exception 'FAIL: update did not persist'; end if;
  update public.posts set status='approved' where id=current_setting('aasiflow_test.post_a')::uuid;
  update public.posts set status='scheduled',scheduled_for=now()+interval '1 day' where id=current_setting('aasiflow_test.post_a')::uuid;
  update public.posts set caption='Edited scheduled content' where id=current_setting('aasiflow_test.post_a')::uuid;
  if not exists(select 1 from public.posts where status='draft' and scheduled_for is null) then raise exception 'FAIL: edited scheduled post retained approval'; end if;
  denied:=false;
  begin
    insert into public.posts(user_id,idea,platform,tone,caption,status) values(current_setting('aasiflow_test.user_b')::uuid,'Wrong owner','Instagram','Friendly','Test','draft');
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: cross-user insert permitted'; end if;
  denied:=false;
  begin update public.posts set user_id=current_setting('aasiflow_test.user_b')::uuid where id=current_setting('aasiflow_test.post_a')::uuid;
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: ownership reassignment permitted'; end if;
  denied:=false;
  begin update public.posts set status='scheduled',scheduled_for=now()-interval '1 day' where id=current_setting('aasiflow_test.post_a')::uuid;
  exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'FAIL: past schedule permitted'; end if;
  denied:=false;
  begin update public.posts set media=jsonb_build_object('path',current_setting('aasiflow_test.user_b')||'/file') where id=current_setting('aasiflow_test.post_a')::uuid;
  exception when check_violation then denied:=true; end;
  if not denied then raise exception 'FAIL: cross-user attachment permitted'; end if;
  for n in 1..20 loop
    result:=public.consume_ai_quota();
    if result is distinct from true then raise exception 'FAIL: quota rejected attempt %',n; end if;
  end loop;
  if public.consume_ai_quota() is distinct from false then raise exception 'FAIL: 21st AI attempt permitted'; end if;
  denied:=false;
  begin update public.ai_usage set calls=0 where user_id=auth.uid();
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: user can reset quota'; end if;
  insert into storage.objects(bucket_id,name) values('post-media',current_setting('aasiflow_test.user_a')||'/test-policy-only');
  select count(*) into n from storage.objects where bucket_id='post-media';
  if n<>1 then raise exception 'FAIL: own storage row not readable'; end if;
  denied:=false;
  begin insert into storage.objects(bucket_id,name) values('post-media',current_setting('aasiflow_test.user_b')||'/wrong-owner');
  exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: upload into another user folder permitted'; end if;
end $$;
select set_config('request.jwt.claims',json_build_object('sub',current_setting('aasiflow_test.user_b'),'role','authenticated')::text,true);
do $$
declare n integer;
begin
  select count(*) into n from public.posts; if n<>0 then raise exception 'FAIL: user B can read user A posts'; end if;
  update public.posts set caption='Unwanted change' where id=current_setting('aasiflow_test.post_a')::uuid;
  get diagnostics n=row_count; if n<>0 then raise exception 'FAIL: user B can edit user A posts'; end if;
  select count(*) into n from storage.objects where bucket_id='post-media'; if n<>0 then raise exception 'FAIL: user B can read user A storage'; end if;
  select count(*) into n from public.ai_usage; if n<>0 then raise exception 'FAIL: user B can read user A usage'; end if;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$
declare denied boolean:=false;
begin
  begin perform * from public.posts; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: anonymous table read permitted'; end if;
  denied:=false;
  begin perform public.consume_ai_quota(); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: anonymous quota call permitted'; end if;
end $$;
reset role;
rollback;
select 'PASS: save/update, approval reset, future schedules, post/storage/usage ownership, quota limit and anonymous denial; all test data rolled back.' as verification;
