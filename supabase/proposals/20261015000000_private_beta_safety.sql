-- REVIEW ONLY. Apply explicitly after the pending owner-monitoring migration.
-- No invitations, admin assignments, provider activation or customer data changes.
begin;
do $$ begin
  if to_regclass('private.owner_admins') is null or to_regprocedure('private.owner_monitoring()') is null
    or to_regprocedure('private.has_active_session()') is null or to_regprocedure('private.consume_ai_quota()') is null then
    raise exception 'Review and apply the canonical backend and pending owner-monitoring prerequisites first';
  end if;
end $$;
create table private.beta_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  revoked boolean not null default false
);
create table private.beta_controls (
  singleton boolean primary key default true check (singleton),
  ai_enabled boolean not null default false,
  uploads_enabled boolean not null default false,
  model text not null default 'gemini-2.5-flash' check (model = 'gemini-2.5-flash'),
  daily_call_limit integer not null default 0 check (daily_call_limit between 0 and 10000),
  per_user_daily_limit integer not null default 20 check (per_user_daily_limit between 1 and 20),
  daily_budget_usd numeric(14,8) not null default 0 check (daily_budget_usd between 0 and 100000),
  request_reserve_usd numeric(14,8) not null default 0 check (request_reserve_usd between 0 and 100),
  input_usd_per_million numeric(12,6) check (input_usd_per_million between 0 and 1000),
  output_usd_per_million numeric(12,6) check (output_usd_per_million between 0 and 1000),
  max_output_tokens integer not null default 1024 check (max_output_tokens between 128 and 2048),
  constraint beta_ai_config_valid check (not ai_enabled or (
    input_usd_per_million is not null and output_usd_per_million is not null
    and daily_call_limit>0 and daily_budget_usd>=request_reserve_usd and request_reserve_usd>0
    and request_reserve_usd>=(16384*input_usd_per_million + max_output_tokens*output_usd_per_million)/1000000
  ))
);
insert into private.beta_controls(singleton) values(true);
create table private.ai_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'UTC')::date,
  outcome text not null default 'pending' check (outcome in ('pending','success','provider_error','invalid_response','timeout','attachment_error')),
  reserve_usd numeric(14,8) not null,
  input_rate numeric(12,6) not null,
  output_rate numeric(12,6) not null,
  input_tokens integer check (input_tokens between 0 and 1000000),
  output_tokens integer check (output_tokens between 0 and 1000000),
  estimated_usd numeric(14,8),
  latency_ms integer check (latency_ms between 0 and 120000),
  completed_at timestamptz
);
create index ai_requests_day on private.ai_requests(day);
create table private.client_error_counts (
  user_id uuid references auth.users(id) on delete cascade,
  day date not null,
  code text not null check (code in ('render_failed','unhandled_error','unhandled_rejection','ai_failed','save_failed','upload_failed')),
  count integer not null check (count between 1 and 20),
  primary key(user_id,day,code)
);
alter table private.beta_members enable row level security;
alter table private.beta_controls enable row level security;
alter table private.ai_requests enable row level security;
alter table private.client_error_counts enable row level security;
revoke all on private.beta_members, private.beta_controls, private.ai_requests, private.client_error_counts from public, anon, authenticated, service_role;

create function private.beta_access() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_active_session() and exists (
    select 1 from private.beta_members where user_id = auth.uid() and not revoked and expires_at > now()
  );
$$;
revoke all on function private.beta_access() from public, anon, service_role;
grant execute on function private.beta_access() to authenticated;
create function public.beta_access() returns boolean
language sql stable security invoker set search_path = '' as $$ select private.beta_access(); $$;
revoke all on function public.beta_access() from public, anon, service_role;
grant execute on function public.beta_access() to authenticated;

-- Restrictive policies intersect the existing owner/session/lifecycle protections.
create policy "Private Beta access" on public.posts as restrictive for all to authenticated
using ((select private.beta_access())) with check ((select private.beta_access()));
create policy "Private Beta usage access" on public.ai_usage as restrictive for select to authenticated
using ((select private.beta_access()));
create policy "Private Beta metadata access" on public.social_connections as restrictive for select to authenticated using ((select private.beta_access()));
create policy "Private Beta jobs access" on public.publication_jobs as restrictive for select to authenticated using ((select private.beta_access()));
create policy "Private Beta metrics access" on public.post_metrics as restrictive for select to authenticated using ((select private.beta_access()));
create policy "Private Beta orders access" on public.payment_orders as restrictive for select to authenticated using ((select private.beta_access()));
create policy "Private Beta credits access" on public.credit_ledger as restrictive for select to authenticated using ((select private.beta_access()));
create policy "Private Beta media access" on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'post-media' or (select private.beta_access()))
with check (bucket_id <> 'post-media' or (select private.beta_access()));
create function private.beta_uploads_allowed() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.beta_access() and coalesce((select uploads_enabled from private.beta_controls where singleton),false);
$$;
revoke all on function private.beta_uploads_allowed() from public, anon, service_role;
grant execute on function private.beta_uploads_allowed() to authenticated;
create policy "Private Beta uploads disabled by default" on storage.objects as restrictive for insert to authenticated
with check (bucket_id <> 'post-media' or (select private.beta_uploads_allowed()));

create function private.reserve_ai_request(requested_model text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare c private.beta_controls; reservation uuid; attempts integer; committed numeric;
begin
  if not private.beta_access() then return null; end if;
  select * into c from private.beta_controls where singleton for update;
  if not found or not c.ai_enabled or requested_model <> c.model or requested_model is null
    or c.daily_call_limit = 0 or c.daily_budget_usd = 0 or c.request_reserve_usd = 0
    or c.input_usd_per_million is null or c.output_usd_per_million is null
    or c.request_reserve_usd < (16384*c.input_usd_per_million + c.max_output_tokens*c.output_usd_per_million)/1000000 then return null; end if;
  select count(*) into attempts from private.ai_requests where day = (now() at time zone 'UTC')::date;
  -- Unknown spend survives UTC rollover. Never automatically release it.
  select coalesce(sum(greatest(reserve_usd,coalesce(estimated_usd,0))),0) into committed
    from private.ai_requests where day = (now() at time zone 'UTC')::date
      or (day < (now() at time zone 'UTC')::date and (outcome='pending' or estimated_usd is null));
  if attempts >= c.daily_call_limit or committed+c.request_reserve_usd > c.daily_budget_usd then return null; end if;
  if coalesce((select calls from public.ai_usage where user_id=auth.uid() and day=(now() at time zone 'UTC')::date),0) >= c.per_user_daily_limit then return null; end if;
  -- Existing per-user daily quota is consumed exactly once, within the reservation transaction.
  if not private.consume_ai_quota() then return null; end if;
  insert into private.ai_requests(user_id,reserve_usd,input_rate,output_rate)
    values(auth.uid(),c.request_reserve_usd,c.input_usd_per_million,c.output_usd_per_million) returning id into reservation;
  return jsonb_build_object('id',reservation,'maxOutputTokens',c.max_output_tokens);
end; $$;
revoke all on function private.reserve_ai_request(text) from public, anon, service_role;
grant execute on function private.reserve_ai_request(text) to authenticated;
create function public.reserve_ai_request(requested_model text) returns jsonb
language sql security invoker set search_path = '' as $$ select private.reserve_ai_request(requested_model); $$;
revoke all on function public.reserve_ai_request(text) from public, anon, service_role;
grant execute on function public.reserve_ai_request(text) to authenticated;
-- Legacy generators cannot supply trusted usage/output limits. Keep their public
-- quota entry point closed; only the reviewed reservation path can consume the
-- unchanged private per-user accounting during this Beta.
create or replace function public.consume_ai_quota() returns boolean
language sql security invoker set search_path = '' as $$
  select false;
$$;

create function private.finish_ai_request(request_id uuid, result_code text, prompt_tokens integer, completion_tokens integer, duration_ms integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare r private.ai_requests; estimate numeric;
begin
  if result_code is null or result_code not in ('success','provider_error','invalid_response','timeout','attachment_error')
    or duration_ms is null or duration_ms not between 0 and 120000
    or (prompt_tokens is null) <> (completion_tokens is null)
    or prompt_tokens not between 0 and 1000000 or completion_tokens not between 0 and 1000000 then return false; end if;
  -- Match reservation lock ordering: configuration first, then request.
  perform 1 from private.beta_controls where singleton for update;
  select * into r from private.ai_requests where id=request_id for update;
  if not found or r.outcome <> 'pending' then return false; end if;
  estimate := (prompt_tokens*r.input_rate + completion_tokens*r.output_rate)/1000000;
  update private.ai_requests set outcome=result_code,input_tokens=prompt_tokens,output_tokens=completion_tokens,
    estimated_usd=estimate,latency_ms=duration_ms,completed_at=now() where id=request_id;
  -- Missing usage never releases a reservation. An underestimated reservation closes AI.
  if estimate > r.reserve_usd then update private.beta_controls set ai_enabled=false where singleton; end if;
  return true;
end; $$;
revoke all on function private.finish_ai_request(uuid,text,integer,integer,integer) from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.finish_ai_request(uuid,text,integer,integer,integer) to service_role;
create function public.finish_ai_request(request_id uuid, result_code text, prompt_tokens integer, completion_tokens integer, duration_ms integer) returns boolean
language sql security invoker set search_path = '' as $$
  select private.finish_ai_request(request_id,result_code,prompt_tokens,completion_tokens,duration_ms);
$$;
revoke all on function public.finish_ai_request(uuid,text,integer,integer,integer) from public, anon, authenticated;
grant execute on function public.finish_ai_request(uuid,text,integer,integer,integer) to service_role;

create function private.report_runtime_error(error_code text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if not private.beta_access() or error_code is null or error_code not in
    ('render_failed','unhandled_error','unhandled_rejection','ai_failed','save_failed','upload_failed') then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,179021005));
  if (select coalesce(sum(count),0) from private.client_error_counts where user_id=auth.uid() and day=(now() at time zone 'UTC')::date) >= 20 then return false; end if;
  insert into private.client_error_counts(user_id,day,code,count) values(auth.uid(),(now() at time zone 'UTC')::date,error_code,1)
    on conflict(user_id,day,code) do update set count=private.client_error_counts.count+1;
  return true;
end; $$;
revoke all on function private.report_runtime_error(text) from public, anon, service_role;
grant execute on function private.report_runtime_error(text) to authenticated;
create function public.report_runtime_error(error_code text) returns boolean
language sql security invoker set search_path = '' as $$ select private.report_runtime_error(error_code); $$;
revoke all on function public.report_runtime_error(text) from public, anon, service_role;
grant execute on function public.report_runtime_error(text) to authenticated;

create or replace function private.owner_monitoring() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare today date := (now() at time zone 'UTC')::date;
begin
  if not private.has_active_session() or not exists (select 1 from private.owner_admins where user_id=auth.uid())
    then raise exception 'Admin access required' using errcode='42501'; end if;
  return jsonb_build_object(
    'users',(select count(*) from auth.users), 'drafts',(select count(*) from public.posts where status='draft'),
    'approved',(select count(*) from public.posts where status='approved'),
    'aiCallsToday',(select coalesce(sum(calls),0) from public.ai_usage where day=today),
    'publishingEnabled',coalesce((select publishing_enabled from private.launch_controls where singleton),false),
    'billingEnabled',coalesce((select billing_enabled from private.launch_controls where singleton),false),
    'measuredCost',null,'subscriptions',null,'runtimeErrors',null,'observedAt',now(),
    'operations',jsonb_build_object(
      'attempts',(select count(*) from private.ai_requests where day=today),
      'pending',(select count(*) from private.ai_requests where day=today and outcome='pending'),
      'errors',(select count(*) from private.ai_requests where day=today and outcome not in ('success','pending')),
      'missingUsage',(select count(*) from private.ai_requests where day=today and completed_at is not null and estimated_usd is null),
      'inputTokens',(select coalesce(sum(input_tokens),0) from private.ai_requests where day=today),
      'outputTokens',(select coalesce(sum(output_tokens),0) from private.ai_requests where day=today),
      'estimatedUsd',(select coalesce(sum(estimated_usd),0) from private.ai_requests where day=today),
      'committedUsd',(select coalesce(sum(greatest(reserve_usd,coalesce(estimated_usd,0))),0) from private.ai_requests where day=today or (day<today and (outcome='pending' or estimated_usd is null))),
      'carryoverUsd',(select coalesce(sum(greatest(reserve_usd,coalesce(estimated_usd,0))),0) from private.ai_requests where day<today and (outcome='pending' or estimated_usd is null)),
      'clientErrors',(select coalesce(sum(count),0) from private.client_error_counts where day=today),
      'aiEnabled',(select ai_enabled from private.beta_controls where singleton),
      'uploadsEnabled',(select uploads_enabled from private.beta_controls where singleton),
      'dailyCallLimit',(select daily_call_limit from private.beta_controls where singleton),
      'dailyBudgetUsd',(select daily_budget_usd from private.beta_controls where singleton)
    ));
end; $$;
commit;
