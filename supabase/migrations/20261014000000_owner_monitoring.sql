-- Pending owner approval. Aggregate-only monitoring; no customer content or credentials.
create table private.owner_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table private.owner_admins enable row level security;
revoke all on private.owner_admins from public, anon, authenticated, service_role;

create function private.owner_monitoring() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.has_active_session() or not exists (
    select 1 from private.owner_admins where user_id = auth.uid()
  ) then raise exception 'Admin access required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'drafts', (select count(*) from public.posts where status = 'draft'),
    'approved', (select count(*) from public.posts where status = 'approved'),
    'aiCallsToday', (select coalesce(sum(calls),0) from public.ai_usage where day = (now() at time zone 'UTC')::date),
    'publishingEnabled', coalesce((select publishing_enabled from private.launch_controls where singleton),false),
    'billingEnabled', coalesce((select billing_enabled from private.launch_controls where singleton),false),
    'measuredCost', null,
    'subscriptions', null,
    'runtimeErrors', null,
    'observedAt', now()
  );
end;
$$;
revoke all on function private.owner_monitoring() from public, anon, service_role;
grant execute on function private.owner_monitoring() to authenticated;
create function public.owner_monitoring() returns jsonb
language sql stable security invoker set search_path = '' as $$ select private.owner_monitoring(); $$;
revoke all on function public.owner_monitoring() from public, anon, service_role;
grant execute on function public.owner_monitoring() to authenticated;
