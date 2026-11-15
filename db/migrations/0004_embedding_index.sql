create index if not exists events_embedding_idx on events using hnsw (embedding vector_cosine_ops);
