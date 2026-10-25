-- Minimal Auth/Storage catalog contracts for an isolated local PostgreSQL test.
-- These are NOT replacements for testing Supabase Auth or Storage over HTTP.
create role anon;
create role authenticated;
create role service_role bypassrls;
alter default privileges grant all on tables to anon, authenticated, service_role;
create schema auth;
create schema storage;
grant usage on schema public,auth,storage to anon,authenticated,service_role;
create table auth.users(id uuid primary key,email text);
create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz,updated_at timestamptz,not_after timestamptz);
revoke all on all tables in schema auth from anon,authenticated,service_role;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb); $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid; $$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text,metadata jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),version text default 'isolated-fixture-v1',unique(bucket_id,name));
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]; $$;
