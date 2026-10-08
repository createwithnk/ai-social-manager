-- Admin rollback verification with random, isolated fixture IDs. No provider
-- calls, real charges/refunds, retained credits, objects or accounts.
begin;
select set_config('aasiflow_test.user_a',gen_random_uuid()::text,true),
       set_config('aasiflow_test.user_b',gen_random_uuid()::text,true),
       set_config('aasiflow_test.session_a',gen_random_uuid()::text,true),
       set_config('aasiflow_test.session_b',gen_random_uuid()::text,true),
       set_config('aasiflow_test.order',gen_random_uuid()::text,true);
select set_config('aasiflow_test.link','plink_'||replace(current_setting('aasiflow_test.order'),'-',''),true),
       set_config('aasiflow_test.payment','pay_'||replace(current_setting('aasiflow_test.order'),'-',''),true);
insert into auth.users(id,email) values
  (current_setting('aasiflow_test.user_a')::uuid,'aasiflow-payment-a-'||current_setting('aasiflow_test.user_a')||'@example.invalid'),
  (current_setting('aasiflow_test.user_b')::uuid,'aasiflow-payment-b-'||current_setting('aasiflow_test.user_b')||'@example.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values
  (current_setting('aasiflow_test.session_a')::uuid,current_setting('aasiflow_test.user_a')::uuid,now(),now()),
  (current_setting('aasiflow_test.session_b')::uuid,current_setting('aasiflow_test.user_b')::uuid,now(),now());
insert into public.payment_orders(id,user_id,plan_id,amount,credits,provider_link_id,status) values
  (current_setting('aasiflow_test.order')::uuid,current_setting('aasiflow_test.user_a')::uuid,'rollback-fixture',10000,2,current_setting('aasiflow_test.link'),'pending');

set local role service_role;
do $$
begin
  if public.service_record_payment('closed_gate',current_setting('aasiflow_test.link'),current_setting('aasiflow_test.order'),10000,'INR',current_setting('aasiflow_test.payment')) is distinct from false then
    raise exception 'FAIL: payment recorded with closed DB gate';
  end if;
  if public.service_claim_publication() is not null then raise exception 'FAIL: publishing gate is open'; end if;
end $$;
reset role;
-- Visible only within this transaction and rolled back at the end. It never
-- enables an environment gate, a collector or a provider call.
update private.launch_controls set billing_enabled=true where singleton;
set local role service_role;
do $$
begin
  if public.service_record_payment('wrong_amount',current_setting('aasiflow_test.link'),current_setting('aasiflow_test.order'),1,'INR',current_setting('aasiflow_test.payment')) is distinct from false then raise exception 'FAIL: wrong amount accepted'; end if;
  if public.service_record_payment('wrong_currency',current_setting('aasiflow_test.link'),current_setting('aasiflow_test.order'),10000,'USD',current_setting('aasiflow_test.payment')) is distinct from false then raise exception 'FAIL: wrong currency accepted'; end if;
  if public.service_record_payment('null_amount',current_setting('aasiflow_test.link'),current_setting('aasiflow_test.order'),null,'INR',current_setting('aasiflow_test.payment')) is distinct from false then raise exception 'FAIL: null amount accepted'; end if;
  if public.service_record_payment('paid_fixture',current_setting('aasiflow_test.link'),current_setting('aasiflow_test.order'),10000,'INR',current_setting('aasiflow_test.payment')) is distinct from true then raise exception 'FAIL: verified payment not recorded'; end if;
  if public.service_record_payment('paid_fixture',current_setting('aasiflow_test.link'),current_setting('aasiflow_test.order'),10000,'INR',current_setting('aasiflow_test.payment')) is distinct from true then raise exception 'FAIL: replay not idempotent'; end if;
  if public.service_record_payment('paid_other_event_id',current_setting('aasiflow_test.link'),current_setting('aasiflow_test.order'),10000,'INR',current_setting('aasiflow_test.payment')) is distinct from true then raise exception 'FAIL: repeated paid outcome not accepted'; end if;
  if (select sum(credits) from public.credit_ledger where user_id=current_setting('aasiflow_test.user_a')::uuid) <> 2 then raise exception 'FAIL: duplicate credit grant'; end if;
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('aasiflow_test.user_a'),'role','authenticated','session_id',current_setting('aasiflow_test.session_a'))::text,true);
do $$
declare denied boolean; n integer;
begin
  if public.has_active_session() is distinct from true then raise exception 'FAIL: valid session denied'; end if;
  if (select count(*) from public.payment_orders) <> 1 then raise exception 'FAIL: own order not readable'; end if;
  if (public.usage_summary()->>'credits')::integer <> 2 then raise exception 'FAIL: own balance incorrect'; end if;
  denied:=false;
  begin insert into public.credit_ledger(user_id,credits) values(auth.uid(),99); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: client can mint credit'; end if;
  denied:=false;
  begin update public.payment_orders set amount=1; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: client can alter order price'; end if;
  denied:=false;
  begin perform public.service_record_payment('client_forge',current_setting('aasiflow_test.link'),current_setting('aasiflow_test.order'),10000,'INR',current_setting('aasiflow_test.payment')); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: client can invoke trusted accounting'; end if;
  denied:=false;
  begin perform * from private.payment_events; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: private payment events exposed'; end if;
  for n in 1..22 loop
    if public.consume_ai_quota() is distinct from true then raise exception 'FAIL: allowed free/paid attempt % rejected',n; end if;
  end loop;
  if public.consume_ai_quota() is distinct from false then raise exception 'FAIL: exhausted credit allowed'; end if;
  if (public.usage_summary()->>'credits')::integer <> 0 then raise exception 'FAIL: paid credit debit incorrect'; end if;
  if (public.usage_summary()->>'attempts')::integer <> 22 then raise exception 'FAIL: attempts incorrect'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('aasiflow_test.user_b'),'role','authenticated','session_id',current_setting('aasiflow_test.session_b'))::text,true);
do $$
begin
  if (select count(*) from public.payment_orders) <> 0 or (select count(*) from public.credit_ledger) <> 0 then raise exception 'FAIL: another user can read payment data'; end if;
  if (public.usage_summary()->>'credits')::integer <> 0 then raise exception 'FAIL: another user received fixture credit'; end if;
end $$;
reset role;
set local role service_role;
do $$
declare refund1 text := 'rfnd_One'||replace(current_setting('aasiflow_test.order'),'-','');
        refund2 text := 'rfnd_Two'||replace(current_setting('aasiflow_test.order'),'-','');
begin
  if public.service_record_refund('over_refund',refund1,current_setting('aasiflow_test.payment'),10001,'INR') is distinct from false then raise exception 'FAIL: excessive refund accepted'; end if;
  if public.service_record_refund('null_refund',refund1,current_setting('aasiflow_test.payment'),null,'INR') is distinct from false then raise exception 'FAIL: null refund accepted'; end if;
  if public.service_record_refund('refund_one',refund1,current_setting('aasiflow_test.payment'),5000,'INR') is distinct from true then raise exception 'FAIL: partial refund rejected'; end if;
  if public.service_record_refund('refund_one',refund1,current_setting('aasiflow_test.payment'),5000,'INR') is distinct from true then raise exception 'FAIL: refund replay rejected'; end if;
  if (select sum(credits) from public.credit_ledger where user_id=current_setting('aasiflow_test.user_a')::uuid) <> -1 then raise exception 'FAIL: partial refund reversed credit more than once'; end if;
  if public.service_record_refund('refund_two',refund2,current_setting('aasiflow_test.payment'),5000,'INR') is distinct from true then raise exception 'FAIL: full refund rejected'; end if;
  if (select sum(credits) from public.credit_ledger where user_id=current_setting('aasiflow_test.user_a')::uuid) <> -2 then raise exception 'FAIL: full refund balance incorrect'; end if;
  if public.service_record_payment('paid_after_refund',current_setting('aasiflow_test.link'),current_setting('aasiflow_test.order'),10000,'INR',current_setting('aasiflow_test.payment')) is distinct from true then raise exception 'FAIL: old paid event reconciliation rejected'; end if;
  if (select status from public.payment_orders where id=current_setting('aasiflow_test.order')::uuid) <> 'refunded' then raise exception 'FAIL: paid replay resurrected refunded order'; end if;
  if (select sum(credits) from public.credit_ledger where user_id=current_setting('aasiflow_test.user_a')::uuid) <> -2 then raise exception 'FAIL: paid replay restored refunded credits'; end if;
end $$;
reset role;
delete from auth.sessions where id=current_setting('aasiflow_test.session_a')::uuid;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('aasiflow_test.user_a'),'role','authenticated','session_id',current_setting('aasiflow_test.session_a'))::text,true);
do $$
declare denied boolean := false;
begin
  if public.has_active_session() is distinct from false then raise exception 'FAIL: revoked session accepted'; end if;
  if (select count(*) from public.payment_orders) <> 0 or (select count(*) from public.credit_ledger) <> 0 then raise exception 'FAIL: revoked session reads payment data'; end if;
  if public.consume_ai_quota() is distinct from false then raise exception 'FAIL: revoked session consumes AI quota'; end if;
  begin perform public.usage_summary(); exception when raise_exception then denied:=true; end;
  if not denied then raise exception 'FAIL: revoked session reads balance'; end if;
end $$;
reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$
declare denied boolean := false;
begin
  begin perform * from public.payment_orders; exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: anonymous payment read permitted'; end if;
  denied:=false;
  begin perform public.service_record_payment('anonymous_forge',current_setting('aasiflow_test.link'),current_setting('aasiflow_test.order'),10000,'INR',current_setting('aasiflow_test.payment')); exception when insufficient_privilege then denied:=true; end;
  if not denied then raise exception 'FAIL: anonymous credit mint permitted'; end if;
end $$;
reset role;
rollback;
select 'PASS: live payment gates, amount/currency/null checks, replay, credit debits/refunds, cross-user/anonymous denial and revoked-session rejection; all fixture data and temporary gate changes rolled back.' as verification;
