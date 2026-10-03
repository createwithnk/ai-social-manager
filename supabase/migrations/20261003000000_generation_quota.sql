-- Explicit privileges complement the existing owner-only RLS policies.
grant select, insert, update, delete on public.posts to authenticated;

create table public.generation_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  requests integer not null check (requests between 1 and 20),
  primary key (user_id, usage_day)
);
alter table public.generation_usage enable row level security;
revoke all on public.generation_usage from anon, authenticated;

create or replace function public.consume_generation_quota()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  count_used integer;
begin
  if caller is null then
    raise exception 'Authentication required';
  end if;
  insert into public.generation_usage as usage (user_id, usage_day, requests)
  values (caller, (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, usage_day) do update
    set requests = usage.requests + 1
    where usage.requests < 20
  returning requests into count_used;
  return count_used is not null;
end;
$$;
revoke all on function public.consume_generation_quota() from public, anon;
grant execute on function public.consume_generation_quota() to authenticated;
