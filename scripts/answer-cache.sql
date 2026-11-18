-- Per-document answer cache for the chat fast path.
-- Keyed by (document_id, normalized question): a re-uploaded file gets a new
-- document id, so cached answers can never leak across files or versions.
create table if not exists answer_cache (
  document_id text not null references documents(id) on delete cascade,
  question text not null,
  answer text not null,
  citations jsonb not null default '[]'::jsonb,
  insufficient boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (document_id, question)
);
alter table answer_cache enable row level security;
grant select, insert, update, delete on answer_cache to service_role;
