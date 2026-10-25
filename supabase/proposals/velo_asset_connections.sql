-- REVIEW ONLY. Not an automatic migration; never apply with a blanket db push.
-- Requires the separately reviewed canonical backend and private Beta safety proposal.
-- Adds only private asset tables/RPCs. Does not alter Auth, posts, policies or layouts.
begin;
do $$ begin
  if to_regclass('private.beta_members') is null or to_regclass('auth.sessions') is null then
    raise exception 'Review the private Beta prerequisites and hosted recovery evidence first';
  end if;
end $$;

create table private.velo_asset_controls (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into private.velo_asset_controls(singleton) values(true);
create table private.velo_asset_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('canva','drive')),
  generation uuid not null default gen_random_uuid(),
  status text not null default 'pending' check (status in ('pending','connected','reconnect','disconnected')),
  encrypted_grant text check (length(encrypted_grant) between 40 and 24000),
  account_id text check (length(account_id) between 1 and 180),
  account_name text check (length(account_name) between 1 and 200),
  expires_at timestamptz,
  lease_id uuid,
  updated_at timestamptz not null default now(),
  unique(user_id,provider),
  check (status <> 'connected' or (encrypted_grant is not null and account_id is not null and account_name is not null and expires_at is not null))
);
create table private.velo_asset_states (
  state_hash text primary key check (state_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  connection_id uuid not null references private.velo_asset_connections(id) on delete cascade,
  provider text not null check (provider in ('canva','drive')),
  generation uuid not null,
  encrypted_verifier text not null check (length(encrypted_verifier) between 40 and 2000),
  expires_at timestamptz not null default now()+interval '10 minutes'
);
create index velo_asset_states_user_expiry on private.velo_asset_states(user_id,expires_at);
create table private.velo_asset_daily (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null default (now() at time zone 'UTC')::date,
  oauth_calls integer not null default 0 check (oauth_calls between 0 and 10),
  read_calls integer not null default 0 check (read_calls between 0 and 100),
  primary key(user_id,day)
);
alter table private.velo_asset_controls enable row level security;
alter table private.velo_asset_connections enable row level security;
alter table private.velo_asset_states enable row level security;
alter table private.velo_asset_daily enable row level security;
revoke all on private.velo_asset_controls, private.velo_asset_connections, private.velo_asset_states, private.velo_asset_daily from public, anon, authenticated, service_role;

create function private.velo_asset_session(uid uuid, sid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select uid is not null and sid is not null and exists (
    select 1 from auth.sessions s where s.id=sid and s.user_id=uid and (s.not_after is null or s.not_after>now())
  );
$$;
create function private.velo_asset_allowed(uid uuid, sid uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select private.velo_asset_session(uid,sid)
    and coalesce((select enabled from private.velo_asset_controls where singleton),false)
    and exists (select 1 from private.beta_members b where b.user_id=uid and not b.revoked and b.expires_at>now());
$$;
revoke all on function private.velo_asset_session(uuid,uuid), private.velo_asset_allowed(uuid,uuid) from public, anon, authenticated, service_role;

-- Service-only command. uid/sid MUST come from a verified bearer, never client JSON.
-- Callback 'take' derives them exclusively from a hashed, one-use state record.
create function private.velo_asset_command(op text, uid uuid, sid uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.velo_asset_connections; s private.velo_asset_states; d private.velo_asset_daily;
  provider_name text; lease uuid; results jsonb; active boolean;
begin
  if p is null or jsonb_typeof(p)<>'object' or octet_length(p::text)>32000 then return null; end if;
  if op='take' then
    if not coalesce(p->>'stateHash' ~ '^[a-f0-9]{64}$',false) then return null; end if;
    delete from private.velo_asset_states where state_hash=p->>'stateHash' returning * into s;
    if not found or s.expires_at<=now() or not private.velo_asset_allowed(s.user_id,s.session_id) then return null; end if;
    select * into c from private.velo_asset_connections where id=s.connection_id;
    if not found or c.generation<>s.generation or c.user_id<>s.user_id or c.provider<>s.provider then return null; end if;
    return jsonb_build_object('id',c.id,'generation',c.generation,'userId',s.user_id,'sessionId',s.session_id,'provider',s.provider,'encryptedVerifier',s.encrypted_verifier);
  end if;
  if not private.velo_asset_session(uid,sid) then return null; end if;
  -- Serialize a user's begin/claim/disconnect operations across both providers.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('velo-assets:'||uid::text,0));
  active := private.velo_asset_allowed(uid,sid);
  if op='list' then
    select coalesce(jsonb_agg(jsonb_build_object('provider',provider,'status',case when lease_id is not null then 'reconnect' else status end,'accountName',account_name,'expiresAt',expires_at,'updatedAt',updated_at) order by provider),'[]'::jsonb)
      into results from private.velo_asset_connections where user_id=uid;
    return jsonb_build_object('enabled',active,'connections',results);
  end if;
  provider_name := p->>'provider';
  if provider_name is null or provider_name not in ('canva','drive') then return null; end if;
  if op='disconnect' then
    update private.velo_asset_connections set encrypted_grant=null,account_id=null,account_name=null,expires_at=null,
      status='disconnected',generation=gen_random_uuid(),lease_id=null,updated_at=now()
      where user_id=uid and provider=provider_name;
    delete from private.velo_asset_states where user_id=uid and provider=provider_name;
    return 'true'::jsonb;
  end if;
  if not active then return null; end if;
  if op='begin' then
    if not coalesce(p->>'stateHash' ~ '^[a-f0-9]{64}$',false)
      or not coalesce(length(p->>'encryptedVerifier') between 40 and 2000,false) then return null; end if;
    delete from private.velo_asset_states where user_id=uid and expires_at<=now();
    if (select count(*) from private.velo_asset_states where user_id=uid)>=3 then return null; end if;
    insert into private.velo_asset_daily(user_id) values(uid) on conflict do nothing;
    select * into d from private.velo_asset_daily where user_id=uid and day=(now() at time zone 'UTC')::date for update;
    if d.oauth_calls>=10 then return null; end if;
    insert into private.velo_asset_connections(user_id,provider) values(uid,provider_name)
      on conflict(user_id,provider) do update set generation=gen_random_uuid(),status='pending',lease_id=null,updated_at=now()
      returning * into c;
    -- A reconnect supersedes every old lease/callback, including a hung refresh.
    insert into private.velo_asset_states(state_hash,user_id,session_id,connection_id,provider,generation,encrypted_verifier)
      values(p->>'stateHash',uid,sid,c.id,provider_name,c.generation,p->>'encryptedVerifier');
    update private.velo_asset_daily set oauth_calls=oauth_calls+1 where user_id=uid and day=d.day;
    return jsonb_build_object('id',c.id,'generation',c.generation);
  end if;
  select * into c from private.velo_asset_connections where user_id=uid and provider=provider_name for update;
  if not found then return null; end if;
  if op='claim' then
    if c.status<>'connected' or c.lease_id is not null then return null; end if;
    insert into private.velo_asset_daily(user_id) values(uid) on conflict do nothing;
    select * into d from private.velo_asset_daily where user_id=uid and day=(now() at time zone 'UTC')::date for update;
    if d.read_calls>=100 then return null; end if;
    lease:=gen_random_uuid();
    update private.velo_asset_connections set lease_id=lease,updated_at=now() where id=c.id;
    update private.velo_asset_daily set read_calls=read_calls+1 where user_id=uid and day=d.day;
    return jsonb_build_object('id',c.id,'generation',c.generation,'lease',lease,'encryptedGrant',c.encrypted_grant);
  end if;
  if not coalesce(c.id::text=p->>'id' and c.generation::text=p->>'generation',false) then return null; end if;
  if op='finish' then
    if not coalesce(c.lease_id::text=p->>'lease',false) then return null; end if;
    if p->>'failed'='true' then
      update private.velo_asset_connections set status='reconnect',encrypted_grant=null,lease_id=null,updated_at=now() where id=c.id;
      return 'true'::jsonb;
    end if;
  elsif op='save' then
    if c.status<>'pending' or c.lease_id is not null then return null; end if;
  else return null;
  end if;
  if not coalesce(length(p->>'encryptedGrant') between 40 and 24000,false)
    or not coalesce(length(p->>'accountId') between 1 and 180,false)
    or not coalesce(length(p->>'accountName') between 1 and 200,false)
    or not coalesce(p->>'expiresAt' ~ '^[0-9]{12,14}$',false) then return null; end if;
  if op='finish' and c.account_id<>p->>'accountId' then return null; end if;
  update private.velo_asset_connections set encrypted_grant=p->>'encryptedGrant',account_id=p->>'accountId',account_name=p->>'accountName',
    expires_at=pg_catalog.to_timestamp((p->>'expiresAt')::double precision/1000),status='connected',lease_id=null,updated_at=now() where id=c.id;
  return 'true'::jsonb;
end;
$$;
revoke all on function private.velo_asset_command(text,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function private.velo_asset_command(text,uuid,uuid,jsonb) to service_role;
create function public.velo_asset_command(op text, uid uuid, sid uuid, p jsonb) returns jsonb
language sql security invoker set search_path='' as $$ select private.velo_asset_command(op,uid,sid,p); $$;
revoke all on function public.velo_asset_command(text,uuid,uuid,jsonb) from public, anon, authenticated;
grant execute on function public.velo_asset_command(text,uuid,uuid,jsonb) to service_role;
comment on function public.velo_asset_command(text,uuid,uuid,jsonb) is 'Velo assets: service-only, verified owner/session inputs; no client grants; disabled by default.';
commit;
