-- Review and apply only to the confirmed AasiFlowAI project. No data is deleted.
alter table public.posts
  add column language text not null default 'en' check (language in ('en', 'ar')),
  add column market text not null default 'General' check (market in ('General', 'UAE', 'Saudi Arabia', 'Kuwait', 'Gulf')),
  add column approved_at timestamptz,
  add column approved_by uuid references auth.users(id);

create function public.protect_post_approval() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() is distinct from new.user_id then
    raise exception 'Authenticated post owner required' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    if old.user_id is distinct from new.user_id then
      raise exception 'Post ownership cannot change' using errcode = '42501';
    end if;
    if old.status in ('approved', 'scheduled') and
       row(old.idea, old.platform, old.tone, old.caption, old.hashtags, old.language, old.market)
       is distinct from row(new.idea, new.platform, new.tone, new.caption, new.hashtags, new.language, new.market) then
      new.status := 'draft';
    end if;
  end if;
  if new.status = 'draft' then
    new.approved_at := null;
    new.approved_by := null;
    new.scheduled_for := null;
  elsif new.status = 'approved' then
    new.scheduled_for := null;
    if tg_op = 'INSERT' then
      new.approved_at := now();
      new.approved_by := auth.uid();
    elsif old.status = 'draft' then
      new.approved_at := now();
      new.approved_by := auth.uid();
    else
      new.approved_at := old.approved_at;
      new.approved_by := old.approved_by;
    end if;
  elsif new.status = 'scheduled' then
    if tg_op = 'INSERT' then
      raise exception 'Approve before scheduling' using errcode = '23514';
    end if;
    if old.status not in ('approved', 'scheduled') or old.approved_at is null or old.approved_by is distinct from auth.uid() then
      raise exception 'Approve before scheduling' using errcode = '23514';
    end if;
    if new.scheduled_for is null or new.scheduled_for <= now() then
      raise exception 'Choose a future scheduling time' using errcode = '23514';
    end if;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
  end if;
  if new.status <> 'draft' and length(trim(new.caption)) = 0 then
    raise exception 'A caption is required for approval' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_post_approval() from public, anon, authenticated;
create trigger protect_post_approval before insert or update on public.posts
for each row execute function public.protect_post_approval();
revoke all on public.posts from anon;
grant select, insert, update, delete on public.posts to authenticated;

create table public.ai_daily_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  attempts integer not null check (attempts between 1 and 20),
  primary key (user_id, usage_date)
);
alter table public.ai_daily_usage enable row level security;
revoke all on public.ai_daily_usage from public, anon, authenticated;
grant select on public.ai_daily_usage to authenticated;
create policy "Read own AI usage" on public.ai_daily_usage
for select to authenticated using (auth.uid() = user_id);

-- Only the server may reserve credits. Use the verified auth user ID, never request-body IDs.
-- Atomic upsert prevents concurrent requests exceeding the cap. Provider failures count too.
create function public.consume_ai_credit(p_user_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare used integer;
begin
  insert into public.ai_daily_usage (user_id, usage_date, attempts)
  values (p_user_id, (now() at time zone 'UTC')::date, 1)
  on conflict (user_id, usage_date) do update
  set attempts = public.ai_daily_usage.attempts + 1
  where public.ai_daily_usage.attempts < 20
  returning attempts into used;
  return used is not null;
end;
$$;
revoke all on function public.consume_ai_credit(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_credit(uuid) to service_role;
