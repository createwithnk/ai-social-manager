-- This migration does not enable publication, payments, Cron, or public storage.
-- All sensitive operations are behind private functions with explicit grants.
create or replace function private.has_active_session() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare sid text := auth.jwt()->>'session_id';
begin
  if auth.uid() is null or sid is null or sid !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
  return exists (select 1 from auth.sessions s where s.id = sid::uuid and s.user_id = auth.uid()
    and (s.not_after is null or s.not_after > now()));
exception when invalid_text_representation then return false;
end; $$;
revoke all on function private.has_active_session() from public, anon;
grant execute on function private.has_active_session() to authenticated;
create or replace function public.has_active_session() returns boolean
language sql stable security invoker set search_path = '' as $$ select private.has_active_session(); $$;
revoke all on function public.has_active_session() from public, anon;
grant execute on function public.has_active_session() to authenticated;

alter policy "Users can read their own posts" on public.posts using ((select auth.uid()) = user_id and (select private.has_active_session()));
alter policy "Users can create their own posts" on public.posts with check ((select auth.uid()) = user_id and (select private.has_active_session()));
alter policy "Users can update their own posts" on public.posts using ((select auth.uid()) = user_id and (select private.has_active_session())) with check ((select auth.uid()) = user_id and (select private.has_active_session()));
alter policy "Users can delete their own posts" on public.posts using ((select auth.uid()) = user_id and (select private.has_active_session()));
alter policy "Read own usage" on public.ai_usage using (user_id = (select auth.uid()) and (select private.has_active_session()));
alter policy "Read own media" on storage.objects using (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text and (select private.has_active_session()));
alter policy "Upload own media" on storage.objects with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text and (select private.has_active_session()));
create function private.media_upload_allowed() returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_active_session() then return false; end if;
  -- Each object is separately limited to 10 MB by the bucket. Serialize this
  -- count across uploads: <=20/user and <=80/bucket, including placeholders.
  perform pg_advisory_xact_lock(179021004);
  return (select count(*) < 20 from storage.objects where bucket_id = 'post-media' and split_part(name,'/',1) = auth.uid()::text)
    and (select count(*) < 80 from storage.objects where bucket_id = 'post-media');
end; $$;
revoke all on function private.media_upload_allowed() from public, anon;
grant execute on function private.media_upload_allowed() to authenticated;
alter policy "Upload own media" on storage.objects with check (bucket_id = 'post-media' and (storage.foldername(name))[1] = (select auth.uid())::text and (select private.media_upload_allowed()));
create or replace function private.consume_ai_quota() returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if not private.has_active_session() then return false; end if;
  insert into public.ai_usage (user_id, day, calls) values (auth.uid(), (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, day) do update set calls = public.ai_usage.calls + 1 where public.ai_usage.calls < 20
  returning calls into n;
  return n is not null;
end; $$;

create table private.launch_controls (
  singleton boolean primary key default true check (singleton),
  publishing_enabled boolean not null default false,
  billing_enabled boolean not null default false
);
insert into private.launch_controls(singleton) values(true);
create table public.social_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check(provider in ('instagram','linkedin')),
  account_id text not null check(length(account_id) between 1 and 180),
  account_name text not null check(length(account_name) between 1 and 200),
  scopes text[] not null default '{}',
  expires_at timestamptz not null,
  status text not null default 'connected' check(status in ('connected','expired','disconnected')),
  connected_at timestamptz not null default now(),
  unique(user_id, provider)
);
create table private.social_credentials (
  connection_id uuid primary key references public.social_connections(id) on delete cascade,
  ciphertext text not null check(length(ciphertext) <= 32000),
  updated_at timestamptz not null default now()
);
create table private.oauth_states (
  state_hash text primary key check(state_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  provider text not null check(provider in ('instagram','linkedin')),
  expires_at timestamptz not null default now() + interval '10 minutes',
  created_at timestamptz not null default now()
);
create index oauth_states_user_idx on private.oauth_states(user_id, expires_at);
create table private.action_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  day date not null,
  calls integer not null,
  primary key(user_id, action, day)
);

alter table public.posts add column revision integer not null default 1;
alter table public.posts add column updated_at timestamptz not null default now();
create function private.valid_hashtags(tags text[]) returns boolean language sql immutable set search_path = '' as $$
  -- PostgreSQL POSIX alnum depends on DB locale. Enforce storage bounds and no
  -- whitespace/# here; the adapters validate Unicode letters/marks/numbers.
  select cardinality(tags) <= 8 and not exists(select 1 from unnest(tags) t where t is null or length(t) not between 1 and 80 or t ~ '[[:space:][:cntrl:]#]');
$$;
revoke all on function private.valid_hashtags(text[]) from public, anon;
grant execute on function private.valid_hashtags(text[]) to authenticated, service_role;
create function private.valid_media(m jsonb, uid uuid) returns boolean language plpgsql immutable set search_path = '' as $$
begin
  if m is null then return true; end if;
  if jsonb_typeof(m) <> 'object' or jsonb_typeof(m->'size') <> 'number' or coalesce(m->>'size','') !~ '^[0-9]{1,8}$' then return false; end if;
  return coalesce(jsonb_typeof(m->'path') = 'string' and m->>'path' ~ ('^' || uid::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,150}$')
    and jsonb_typeof(m->'name') = 'string' and length(m->>'name') between 1 and 200
    and m->>'type' in ('image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/webm','audio/mp4','audio/mpeg','audio/wav','audio/ogg')
    and (m->>'size')::integer between 1 and 10485760,false);
end; $$;
revoke all on function private.valid_media(jsonb,uuid) from public, anon;
grant execute on function private.valid_media(jsonb,uuid) to authenticated, service_role;
alter table public.posts add constraint post_media_format check(private.valid_media(media,user_id)) not valid;
alter table public.posts add constraint post_content_limits check (
  length(idea) between 1 and 500 and length(caption) between 1 and 63206
  and tone in ('Friendly','Professional','Bold','Educational')
  and language in ('English','Hindi','Urdu','Arabic')
  and private.valid_hashtags(hashtags)
  and length(caption || case when cardinality(hashtags) > 0 then E'\n\n#' || array_to_string(hashtags,' #') else '' end)
    <= case platform when 'Instagram' then 2200 when 'LinkedIn' then 3000 when 'X' then 280 else 63206 end
) not valid;
create table public.publication_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  connection_id uuid not null references public.social_connections(id),
  post_revision integer not null,
  snapshot jsonb not null,
  due_at timestamptz not null,
  status text not null default 'queued' check(status in ('queued','processing','published','failed','uncertain','cancelled')),
  lease_id uuid,
  lease_until timestamptz,
  attempts integer not null default 0,
  container_id text,
  provider_post_id text,
  error_code text,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique(post_id, post_revision)
);
create index publication_jobs_due_idx on public.publication_jobs(due_at) where status = 'queued';
create index publication_jobs_user_idx on public.publication_jobs(user_id, created_at desc);
create index publication_jobs_connection_idx on public.publication_jobs(connection_id);
create table public.post_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_id uuid not null references public.publication_jobs(id) on delete cascade,
  impressions bigint check(impressions >= 0),
  reactions bigint check(reactions >= 0),
  comments bigint check(comments >= 0),
  shares bigint check(shares >= 0),
  source text not null check(source in ('instagram','linkedin')),
  observed_at timestamptz not null default now()
);
create index post_metrics_user_idx on public.post_metrics(user_id, observed_at desc);
create index post_metrics_job_idx on public.post_metrics(job_id, observed_at desc);

create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  amount integer not null check(amount > 0),
  currency text not null default 'INR' check(currency = 'INR'),
  credits integer not null check(credits > 0),
  provider_link_id text unique,
  provider_payment_id text unique,
  refunded_amount integer not null default 0 check(refunded_amount >= 0 and refunded_amount <= amount),
  credits_reversed integer not null default 0 check(credits_reversed >= 0 and credits_reversed <= credits),
  status text not null default 'creating' check(status in ('creating','pending','paid','failed','uncertain','partial_refund','refunded')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index payment_orders_user_idx on public.payment_orders(user_id, created_at desc);
create table public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid unique references public.payment_orders(id),
  credits integer not null check(credits <> 0),
  source_ref text unique,
  created_at timestamptz not null default now()
);
create index credit_ledger_user_idx on public.credit_ledger(user_id);
create or replace function private.consume_ai_quota() returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer; balance bigint;
begin
  if not private.has_active_session() then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,20));
  insert into public.ai_usage(user_id,day,calls) values(auth.uid(),(now() at time zone 'UTC')::date,0) on conflict do nothing;
  select calls into n from public.ai_usage where user_id = auth.uid() and day = (now() at time zone 'UTC')::date for update;
  if n >= 20 then
    if n >= 100 or not coalesce((select billing_enabled from private.launch_controls where singleton),false) then return false; end if;
    select coalesce(sum(credits),0) into balance from public.credit_ledger where user_id = auth.uid();
    if balance < 1 then return false; end if;
    insert into public.credit_ledger(user_id,credits) values(auth.uid(),-1);
  end if;
  update public.ai_usage set calls = calls + 1 where user_id = auth.uid() and day = (now() at time zone 'UTC')::date;
  return true;
end; $$;
create table private.payment_events (
  event_id text primary key,
  order_id uuid not null references public.payment_orders(id),
  processed_at timestamptz not null default now()
);
create table private.payment_refunds (
  refund_id text primary key,
  order_id uuid not null references public.payment_orders(id),
  amount integer not null check(amount > 0),
  processed_at timestamptz not null default now()
);
create index payment_refunds_order_idx on private.payment_refunds(order_id);

-- No table containing OAuth state or token ciphertext is exposed to API roles.
do $$ declare t text; begin
  foreach t in array array['launch_controls','social_credentials','oauth_states','action_usage','payment_events','payment_refunds'] loop
    execute format('alter table private.%I enable row level security',t);
    execute format('revoke all on private.%I from public, anon, authenticated, service_role',t);
  end loop;
  foreach t in array array['social_connections','publication_jobs','post_metrics','payment_orders','credit_ledger'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant select, insert, update, delete on public.%I to service_role',t);
    execute format('create policy "Owner reads metadata" on public.%I for select to authenticated using (user_id = (select auth.uid()) and (select private.has_active_session()))',t);
  end loop;
end $$;
grant usage on schema private to service_role;

drop trigger guard_post_edit on public.posts;
drop function public.guard_post_edit();
create function private.guard_post_lifecycle() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null and new.user_id <> auth.uid() then raise insufficient_privilege using message='Post ownership mismatch'; end if;
    perform pg_advisory_xact_lock(179021005);
    if (select count(*) from public.posts where user_id=new.user_id) >= 200 or (select count(*) from public.posts) >= 1000 then
      raise exception 'Post storage limit reached. Ask the owner to review retained drafts';
    end if;
  end if;
  if tg_op <> 'INSERT' and exists(select 1 from public.publication_jobs where post_id = old.id and status = 'processing') then
    raise exception 'Publication is processing. Wait before changing this post';
  end if;
  if tg_op = 'DELETE' then
    update public.publication_jobs set status = 'cancelled', error_code = 'post_deleted' where post_id = old.id and status = 'queued';
    return old;
  end if;
  if tg_op = 'INSERT' then new.revision := 1; new.created_at := now();
  else
    if new.id is distinct from old.id or new.user_id is distinct from old.user_id then raise insufficient_privilege using message = 'Post identity and ownership cannot change'; end if;
    new.id := old.id; new.user_id := old.user_id; new.created_at := old.created_at;
    new.revision := old.revision + 1;
    if old.status in ('approved','scheduled') and
      (new.caption,new.hashtags,new.idea,new.platform,new.tone,new.media,new.language) is distinct from
      (old.caption,old.hashtags,old.idea,old.platform,old.tone,old.media,old.language) then
      new.status := 'draft'; new.scheduled_for := null;
    end if;
    update public.publication_jobs set status = 'cancelled', error_code = 'post_changed' where post_id = old.id and status = 'queued';
  end if;
  new.updated_at := now();
  if new.status = 'scheduled' and (tg_op = 'INSERT' or new.scheduled_for is distinct from old.scheduled_for or old.status <> 'scheduled') and new.scheduled_for <= now() then
    raise exception 'Choose a future schedule';
  end if;
  return new;
end; $$;
revoke all on function private.guard_post_lifecycle() from public, anon, authenticated;
create trigger guard_post_lifecycle before insert or update or delete on public.posts for each row execute function private.guard_post_lifecycle();

create function private.launch_status() returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('publishing',publishing_enabled,'billing',billing_enabled) from private.launch_controls where singleton;
$$;
revoke all on function private.launch_status() from public, anon;
grant execute on function private.launch_status() to authenticated, service_role;
create function public.launch_status() returns jsonb language sql stable security invoker set search_path = '' as $$ select private.launch_status(); $$;
revoke all on function public.launch_status() from public, anon;
grant execute on function public.launch_status() to authenticated, service_role;
create function private.usage_summary() returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_active_session() then raise exception 'Session expired'; end if;
  return jsonb_build_object('attempts',coalesce((select calls from public.ai_usage where user_id=auth.uid() and day=(now() at time zone 'UTC')::date),0),
    'credits',coalesce((select sum(credits) from public.credit_ledger where user_id=auth.uid()),0));
end; $$;
revoke all on function private.usage_summary() from public, anon;
grant execute on function private.usage_summary() to authenticated;
create function public.usage_summary() returns jsonb language sql stable security invoker set search_path = '' as $$ select private.usage_summary(); $$;
revoke all on function public.usage_summary() from public, anon;
grant execute on function public.usage_summary() to authenticated;

create function private.service_action_quota(uid uuid, kind text, maximum integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if maximum < 1 or maximum > 100 or kind not in ('oauth','analytics','checkout') then return false; end if;
  insert into private.action_usage values(uid,kind,(now() at time zone 'UTC')::date,1)
  on conflict(user_id,action,day) do update set calls = private.action_usage.calls + 1 where private.action_usage.calls < maximum returning calls into n;
  return n is not null;
end; $$;
create function public.service_action_quota(uid uuid, kind text, maximum integer) returns boolean
language sql security invoker set search_path = '' as $$ select private.service_action_quota(uid,kind,maximum); $$;

create function private.service_oauth_start(hash text, uid uuid, sid uuid, provider_name text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text,17));
  if not exists(select 1 from auth.sessions where id = sid and user_id = uid and (not_after is null or not_after > now())) then return false; end if;
  if (select count(*) from private.oauth_states where user_id = uid and expires_at > now()) >= 3 then return false; end if;
  if not private.service_action_quota(uid,'oauth',10) then return false; end if;
  insert into private.oauth_states(state_hash,user_id,session_id,provider) values(hash,uid,sid,provider_name);
  return true;
end; $$;
create function public.service_oauth_start(hash text, uid uuid, sid uuid, provider_name text) returns boolean
language sql security invoker set search_path = '' as $$ select private.service_oauth_start(hash,uid,sid,provider_name); $$;
create function private.service_oauth_take(hash text) returns jsonb language plpgsql security definer set search_path = '' as $$
declare item private.oauth_states;
begin
  delete from private.oauth_states where state_hash = hash returning * into item;
  if item.state_hash is null or item.expires_at <= now() or not exists(select 1 from auth.sessions where id = item.session_id and user_id = item.user_id and (not_after is null or not_after > now())) then return null; end if;
  return jsonb_build_object('user_id',item.user_id,'provider',item.provider);
end; $$;
create function public.service_oauth_take(hash text) returns jsonb language sql security invoker set search_path = '' as $$ select private.service_oauth_take(hash); $$;
create function private.service_store_credential(cid uuid, encrypted text) returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into private.social_credentials(connection_id,ciphertext) values(cid,encrypted)
  on conflict(connection_id) do update set ciphertext = excluded.ciphertext, updated_at = now();
end; $$;
create function public.service_store_credential(cid uuid, encrypted text) returns void language sql security invoker set search_path = '' as $$ select private.service_store_credential(cid,encrypted); $$;
create function private.service_connect_account(cid uuid, uid uuid, provider_name text, remote_id text, display_name text, granted_scopes text[], expiry timestamptz, encrypted text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text,19));
  if exists(select 1 from public.publication_jobs where connection_id = cid and status = 'processing') then raise exception 'Wait for the current publication'; end if;
  insert into public.social_connections(id,user_id,provider,account_id,account_name,scopes,expires_at,status)
  values(cid,uid,provider_name,remote_id,display_name,granted_scopes,expiry,'connected')
  on conflict(id) do update set account_id = excluded.account_id,account_name = excluded.account_name,scopes = excluded.scopes,expires_at = excluded.expires_at,status = 'connected',connected_at = now()
  where public.social_connections.user_id = uid and public.social_connections.provider = provider_name;
  if not found then raise exception 'Account ownership mismatch'; end if;
  perform private.service_store_credential(cid,encrypted);
  update public.publication_jobs set status = 'cancelled',error_code = 'account_reconnected' where connection_id = cid and status = 'queued';
end; $$;
create function public.service_connect_account(cid uuid, uid uuid, provider_name text, remote_id text, display_name text, granted_scopes text[], expiry timestamptz, encrypted text) returns void
language sql security invoker set search_path = '' as $$ select private.service_connect_account(cid,uid,provider_name,remote_id,display_name,granted_scopes,expiry,encrypted); $$;
create function private.service_read_credential(cid uuid) returns text language sql stable security definer set search_path = '' as $$
  select ciphertext from private.social_credentials where connection_id = cid;
$$;
create function public.service_read_credential(cid uuid) returns text language sql stable security invoker set search_path = '' as $$ select private.service_read_credential(cid); $$;
create function private.service_disconnect(cid uuid, uid uuid) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.social_connections where id = cid and user_id = uid for update;
  if not found then return false; end if;
  if exists(select 1 from public.publication_jobs where connection_id = cid and status = 'processing') then return false; end if;
  delete from private.social_credentials where connection_id = cid;
  update public.social_connections set status = 'disconnected' where id = cid;
  update public.publication_jobs set status = 'cancelled', error_code = 'account_disconnected' where connection_id = cid and status = 'queued';
  return true;
end; $$;
create function public.service_disconnect(cid uuid, uid uuid) returns boolean language sql security invoker set search_path = '' as $$ select private.service_disconnect(cid,uid); $$;

create function private.enqueue_publication(pid uuid, cid uuid, expected_revision integer, when_due timestamptz) returns uuid
language plpgsql security definer set search_path = '' as $$
declare p public.posts; c public.social_connections; result uuid;
begin
  if not private.has_active_session() then raise exception 'Session expired'; end if;
  if not coalesce((select publishing_enabled from private.launch_controls where singleton),false) then raise exception 'Publishing requires owner permission'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,18));
  select * into p from public.posts where id = pid and user_id = auth.uid() for update;
  select * into c from public.social_connections where id = cid and user_id = auth.uid() for update;
  if p.id is null or c.id is null or p.revision <> expected_revision or p.status not in ('approved','scheduled') then raise exception 'Review and approve this exact post first'; end if;
  if exists(select 1 from public.publication_jobs where post_id = pid and status = 'uncertain') then raise exception 'Check the previous uncertain publication with the owner first'; end if;
  if c.status <> 'connected' or c.expires_at <= now() or lower(p.platform) <> c.provider then raise exception 'Connect the matching account first'; end if;
  if when_due is null or when_due < now() - interval '30 seconds' or when_due > now() + interval '90 days' then raise exception 'Invalid publication time'; end if;
  if (select count(*) from public.publication_jobs where user_id = auth.uid() and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC' and status <> 'cancelled') >= 20 then raise exception 'Daily publication limit reached'; end if;
  insert into public.publication_jobs(user_id,post_id,connection_id,post_revision,snapshot,due_at)
  values(auth.uid(),pid,cid,p.revision,jsonb_build_object('caption',p.caption,'hashtags',p.hashtags,'media',p.media,'platform',p.platform),when_due)
  returning id into result;
  return result;
end; $$;
revoke all on function private.enqueue_publication(uuid,uuid,integer,timestamptz) from public, anon;
grant execute on function private.enqueue_publication(uuid,uuid,integer,timestamptz) to authenticated;
create function public.enqueue_publication(pid uuid, cid uuid, expected_revision integer, when_due timestamptz) returns uuid
language sql security invoker set search_path = '' as $$ select private.enqueue_publication(pid,cid,expected_revision,when_due); $$;
revoke all on function public.enqueue_publication(uuid,uuid,integer,timestamptz) from public, anon;
grant execute on function public.enqueue_publication(uuid,uuid,integer,timestamptz) to authenticated;
create function private.cancel_publication(jid uuid) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not private.has_active_session() then return false; end if;
  update public.publication_jobs set status = 'cancelled', error_code = 'cancelled_by_user' where id = jid and user_id = auth.uid() and status = 'queued';
  return found;
end; $$;
revoke all on function private.cancel_publication(uuid) from public, anon;
grant execute on function private.cancel_publication(uuid) to authenticated;
create function public.cancel_publication(jid uuid) returns boolean language sql security invoker set search_path = '' as $$ select private.cancel_publication(jid); $$;
revoke all on function public.cancel_publication(uuid) from public, anon;
grant execute on function public.cancel_publication(uuid) to authenticated;

create function private.service_claim_publication() returns jsonb language plpgsql security definer set search_path = '' as $$
declare j public.publication_jobs;
begin
  if not coalesce((select publishing_enabled from private.launch_controls where singleton),false) then return null; end if;
  -- A lost final response may have published. Never blindly retry a lost lease.
  update public.publication_jobs set status = 'uncertain', error_code = 'worker_lease_expired', lease_until = null where status = 'processing' and lease_until < now();
  select * into j from public.publication_jobs where status = 'queued' and due_at <= now() order by due_at,id for update skip locked limit 1;
  if j.id is null then return null; end if;
  perform 1 from public.posts where id = j.post_id and revision = j.post_revision and status in ('approved','scheduled') for update;
  if not found then update public.publication_jobs set status = 'cancelled',error_code = 'approval_changed' where id = j.id; return null; end if;
  if not exists(select 1 from public.social_connections where id = j.connection_id and user_id = j.user_id and status = 'connected' and expires_at > now()) then
    update public.publication_jobs set status = 'failed',error_code = 'connection_expired' where id = j.id; return null;
  end if;
  update public.publication_jobs set status = 'processing',lease_id = gen_random_uuid(),lease_until = now() + interval '5 minutes',attempts = attempts + 1 where id = j.id returning * into j;
  return to_jsonb(j);
end; $$;
create function public.service_claim_publication() returns jsonb language sql security invoker set search_path = '' as $$ select private.service_claim_publication(); $$;
create function private.service_finish_publication(jid uuid, lease uuid, outcome text, remote_id text, container text, code text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if outcome not in ('queued','published','failed','uncertain') then return false; end if;
  update public.publication_jobs set status = outcome, provider_post_id = coalesce(remote_id,provider_post_id),container_id = coalesce(container,container_id),
    error_code = left(code,80), published_at = case when outcome = 'published' then now() else published_at end,
    due_at = case when outcome = 'queued' then now() + interval '60 seconds' else due_at end, lease_until = null
  where id = jid and status = 'processing' and lease_id = lease and lease_until > now();
  return found;
end; $$;
create function public.service_finish_publication(jid uuid, lease uuid, outcome text, remote_id text, container text, code text) returns boolean
language sql security invoker set search_path = '' as $$ select private.service_finish_publication(jid,lease,outcome,remote_id,container,code); $$;

create function private.service_record_payment(event_key text, link_id text, reference text, paid_amount integer, paid_currency text, payment_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare o public.payment_orders;
begin
  if not coalesce((select billing_enabled from private.launch_controls where singleton),false) then return false; end if;
  if event_key is null or link_id is null or reference is null or paid_amount is null or paid_currency is null or payment_id is null or length(event_key) not between 1 and 180 then return false; end if;
  -- A signed paid event may arrive before checkout stores the returned link ID.
  -- Match the immutable server reference and price, then bind the provider ID.
  select * into o from public.payment_orders where id::text = reference for update;
  if o.id is null or link_id !~ '^plink_[A-Za-z0-9]+$' or (o.provider_link_id is not null and o.provider_link_id <> link_id) or o.amount <> paid_amount or o.currency <> paid_currency or payment_id !~ '^pay_[A-Za-z0-9]+$' or (o.provider_payment_id is not null and o.provider_payment_id <> payment_id) then return false; end if;
  insert into private.payment_events(event_id,order_id) values(event_key,o.id) on conflict do nothing;
  if not found then return exists(select 1 from private.payment_events where event_id=event_key and order_id=o.id); end if;
  insert into public.credit_ledger(user_id,order_id,credits) values(o.user_id,o.id,o.credits) on conflict(order_id) do nothing;
  update public.payment_orders set status = case when refunded_amount=amount then 'refunded' when refunded_amount>0 then 'partial_refund' else 'paid' end,
    provider_link_id=link_id,provider_payment_id=payment_id,paid_at = coalesce(paid_at,now()) where id = o.id;
  return true;
end; $$;
create function public.service_record_payment(event_key text, link_id text, reference text, paid_amount integer, paid_currency text, payment_id text) returns boolean
language sql security invoker set search_path = '' as $$ select private.service_record_payment(event_key,link_id,reference,paid_amount,paid_currency,payment_id); $$;
create function private.service_record_refund(event_key text, refund_id text, payment_id text, refund_amount integer, refund_currency text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare o public.payment_orders; total integer; reversed integer;
begin
  if event_key is null or refund_id is null or payment_id is null or refund_amount is null or refund_currency is null or not coalesce((select billing_enabled from private.launch_controls where singleton),false) or refund_id !~ '^rfnd_[A-Za-z0-9]+$' or length(event_key) not between 1 and 180 then return false; end if;
  select * into o from public.payment_orders where provider_payment_id=payment_id for update;
  if o.id is null or o.status not in ('paid','partial_refund','refunded') or refund_currency <> o.currency or refund_amount < 1 then return false; end if;
  if exists(select 1 from private.payment_refunds r where r.refund_id=service_record_refund.refund_id) then
    return exists(select 1 from private.payment_refunds r where r.refund_id=service_record_refund.refund_id and r.order_id=o.id and r.amount=refund_amount);
  end if;
  total := o.refunded_amount + refund_amount;
  if total > o.amount then return false; end if;
  insert into private.payment_events(event_id,order_id) values(event_key,o.id) on conflict do nothing;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(o.user_id::text,20));
  insert into private.payment_refunds(refund_id,order_id,amount) values(refund_id,o.id,refund_amount);
  reversed := ceil(o.credits::numeric * total / o.amount)::integer;
  if reversed > o.credits_reversed then
    insert into public.credit_ledger(user_id,credits,source_ref) values(o.user_id,o.credits_reversed-reversed,'refund:' || refund_id);
  end if;
  update public.payment_orders set refunded_amount=total,credits_reversed=reversed,status=case when total=amount then 'refunded' else 'partial_refund' end where id=o.id;
  return true;
end; $$;
create function public.service_record_refund(event_key text, refund_id text, payment_id text, refund_amount integer, refund_currency text) returns boolean
language sql security invoker set search_path = '' as $$ select private.service_record_refund(event_key,refund_id,payment_id,refund_amount,refund_currency); $$;

-- Newly created functions otherwise inherit PUBLIC EXECUTE. Server RPCs must
-- never be callable with an anonymous key or an ordinary user's signed JWT.
do $$ declare f record; begin
  for f in select n.nspname,p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private') and p.proname like 'service_%' loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
