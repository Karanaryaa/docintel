-- Papertrail / docintel Supabase setup (run once per project).
-- App talks PostgREST + Storage with the service key; RLS enabled with no
-- public policies so anon access is denied by default (fail closed).

create table if not exists documents (
  id text primary key,
  name text not null,
  "sizeBytes" integer not null,
  "pageCount" integer not null,
  status text not null,
  error text,
  "createdAt" timestamptz not null,
  "storageKey" text not null,
  "ocrPages" integer[] not null default '{}',
  kind text not null default 'document'
);

create table if not exists chunks (
  id text primary key,
  "documentId" text not null references documents(id) on delete cascade,
  page integer not null,
  index integer not null,
  text text not null,
  embedding jsonb
);
create index if not exists chunks_document_idx on chunks ("documentId");

create table if not exists invoices (
  "documentId" text primary key references documents(id) on delete cascade,
  fields jsonb not null,
  flags jsonb not null,
  "extractedAt" timestamptz not null
);

alter table documents enable row level security;
alter table chunks enable row level security;
alter table invoices enable row level security;
-- no policies: only the service role (server-side) can read/write.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- demo-grade durable rate limiting counters (server-side, service role only)
create table if not exists rate_limits (
  bucket text primary key,
  window_start timestamptz not null,
  count integer not null
);
alter table rate_limits enable row level security;

-- API access for the server-side service role
grant usage on schema public to service_role;
grant select, insert, update, delete on public.documents, public.chunks, public.invoices, public.rate_limits to service_role;
