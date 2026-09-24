create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  idea text not null check (char_length(idea) between 1 and 500),
  platform text not null check (platform in ('Instagram', 'LinkedIn', 'Facebook', 'X')),
  tone text not null,
  caption text not null,
  hashtags text[] not null default '{}',
  status text not null check (status in ('draft', 'approved', 'scheduled')),
  created_at timestamptz not null default now(),
  scheduled_for timestamptz
);

create index posts_user_id_created_at_idx on public.posts (user_id, created_at desc);

alter table public.posts enable row level security;

create policy "Users can read their own posts"
  on public.posts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can create their own posts"
  on public.posts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own posts"
  on public.posts for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own posts"
  on public.posts for delete
  to authenticated
  using (auth.uid() = user_id);
