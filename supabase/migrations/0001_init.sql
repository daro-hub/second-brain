create extension if not exists vector;

create table documents (
  id uuid primary key default gen_random_uuid(),
  content text not null,
  source text not null,
  metadata jsonb not null default '{}',
  embedding vector(1536),
  content_tsv tsvector generated always as (to_tsvector('italian', content)) stored,
  created_at timestamptz not null default now()
);

create index documents_embedding_idx on documents using hnsw (embedding vector_cosine_ops);
create index documents_tsv_idx on documents using gin (content_tsv);
create index documents_source_idx on documents (source);
create index documents_created_at_idx on documents (created_at desc);

create or replace function match_documents(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  id uuid,
  content text,
  source text,
  metadata jsonb,
  created_at timestamptz,
  similarity float
)
language sql stable
as $$
  select id, content, source, metadata, created_at,
         1 - (embedding <=> query_embedding) as similarity
  from documents
  order by embedding <=> query_embedding
  limit match_count;
$$;
