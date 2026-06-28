-- 0003 — pgvector match function for the RAG assistant.
-- Run after the FAQ seed is in place.

create or replace function public.match_faq_documents(
  query_embedding vector(1536),
  match_count int default 4
) returns table(id uuid, title text, content text, category text, similarity float)
language sql stable
as $$
  select id, title, content, category,
    1 - (faq_documents.embedding <=> query_embedding) as similarity
  from public.faq_documents
  where embedding is not null
  order by faq_documents.embedding <=> query_embedding
  limit match_count;
$$;
