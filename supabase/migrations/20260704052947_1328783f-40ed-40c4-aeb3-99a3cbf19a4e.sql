create extension if not exists vector;

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  company_id uuid not null,
  user_id uuid not null,
  chunk_index int not null,
  content text not null,
  embedding vector(1536),
  created_at timestamptz not null default now()
);

create index if not exists document_chunks_document_id_idx on public.document_chunks(document_id);
create index if not exists document_chunks_company_id_idx on public.document_chunks(company_id);
create index if not exists document_chunks_embedding_idx
  on public.document_chunks using hnsw (embedding vector_cosine_ops);

grant select, insert, update, delete on public.document_chunks to authenticated;
grant all on public.document_chunks to service_role;

alter table public.document_chunks enable row level security;

create policy "chunks_select_own" on public.document_chunks
  for select to authenticated using (auth.uid() = user_id);
create policy "chunks_insert_own" on public.document_chunks
  for insert to authenticated with check (auth.uid() = user_id);
create policy "chunks_delete_own" on public.document_chunks
  for delete to authenticated using (auth.uid() = user_id);

create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  doc_ids uuid[],
  match_count int default 12
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index int,
  content text,
  similarity float
)
language sql stable
security invoker
set search_path = public
as $$
  select
    c.id,
    c.document_id,
    c.chunk_index,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  where c.document_id = any(doc_ids)
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

grant execute on function public.match_document_chunks(vector, uuid[], int) to authenticated;