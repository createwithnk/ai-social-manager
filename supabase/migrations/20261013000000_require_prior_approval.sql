-- PENDING OWNER APPROVAL. Additive guard only: no row updates, policy replacement,
-- duplicate tables/RPCs/buckets, approval backfill or launch-control changes.
-- Keep private.guard_post_lifecycle intact, including revision/queue protections.
create function private.require_prior_approval() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'scheduled' then
    if tg_op = 'INSERT' then
      raise exception 'Approve before scheduling' using errcode = '23514';
    elsif old.status not in ('approved', 'scheduled') then
      raise exception 'Approve before scheduling' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.require_prior_approval() from public, anon, authenticated;
create trigger aa_require_prior_approval before insert or update on public.posts
for each row execute function private.require_prior_approval();
