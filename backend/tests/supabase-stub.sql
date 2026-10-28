-- Giả lập tối thiểu môi trường Supabase để test schema.sql trên Postgres thuần (PGlite).
-- KHÔNG chạy file này trên Supabase thật.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text not null,
  raw_user_meta_data jsonb not null default '{}',
  last_sign_in_at    timestamptz
);

-- Giống auth.uid() của Supabase: đọc 'sub' từ request.jwt.claims
create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb ->> 'sub', '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;

create publication supabase_realtime;

-- Supabase Auth ghi auth.users bằng role riêng (không phải superuser): test trigger chạy đúng quyền thật
create role supabase_auth_admin nologin;
grant usage on schema auth to supabase_auth_admin;
grant select, insert, update, delete on auth.users to supabase_auth_admin;

-- Supabase Storage (tối thiểu): bucket + objects có RLS, storage.foldername() giống bản thật
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;
create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text not null,
  owner      uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
grant select on storage.buckets to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
create function storage.foldername(name text) returns text[]
language sql immutable
as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;
