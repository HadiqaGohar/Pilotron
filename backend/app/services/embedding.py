import os
import numpy as np
from sentence_transformers import SentenceTransformer
from sqlalchemy.orm import Session
from sqlalchemy import text
from .. import models

# Load model once (small, fast, 384 dimensions)
_model = None

def get_model():
    global _model
    if _model is None:
        print("[embedding] Loading sentence-transformers model...")
        _model = SentenceTransformer("all-MiniLM-L6-v2")
        print("[embedding] Model loaded.")
    return _model

def generate_embedding(text_content: str) -> list[float]:
    """Generate embedding vector for a text chunk."""
    model = get_model()
    embedding = model.encode(text_content, normalize_embeddings=True)
    return embedding.tolist()

def generate_embeddings_batch(texts: list[str]) -> list[list[float]]:
    """Generate embeddings for multiple texts at once (faster)."""
    model = get_model()
    embeddings = model.encode(texts, normalize_embeddings=True, show_progress_bar=False)
    return embeddings.tolist()

def search_similar_chunks(db: Session, query_embedding: list[float], user_id: int, document_id: int = None, top_k: int = 5) -> list[dict]:
    """Find most similar chunks using cosine similarity via pgvector."""
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"
    
    if document_id:
        # Search within a specific document
        query = text("""
            SELECT dc.id, dc.chunk_text, dc.page_number, dc.document_id,
                   d.filename,
                   1 - (dc.embedding <=> CAST(:embedding AS vector)) AS similarity
            FROM document_chunks dc
            JOIN documents d ON d.id = dc.document_id
            WHERE dc.document_id = :doc_id
              AND d.user_id = :user_id
              AND dc.embedding IS NOT NULL
            ORDER BY dc.embedding <=> CAST(:embedding AS vector)
            LIMIT :top_k
        """)
        result = db.execute(query, {
            "embedding": embedding_str,
            "doc_id": document_id,
            "user_id": user_id,
            "top_k": top_k
        })
    else:
        # Search across all user's documents
        query = text("""
            SELECT dc.id, dc.chunk_text, dc.page_number, dc.document_id,
                   d.filename,
                   1 - (dc.embedding <=> CAST(:embedding AS vector)) AS similarity
            FROM document_chunks dc
            JOIN documents d ON d.id = dc.document_id
            WHERE d.user_id = :user_id
              AND d.status = 'ready'
              AND dc.embedding IS NOT NULL
            ORDER BY dc.embedding <=> CAST(:embedding AS vector)
            LIMIT :top_k
        """)
        result = db.execute(query, {
            "embedding": embedding_str,
            "user_id": user_id,
            "top_k": top_k
        })
    
    chunks = []
    for row in result:
        chunks.append({
            "id": row.id,
            "chunk_text": row.chunk_text,
            "page_number": row.page_number,
            "document_id": row.document_id,
            "filename": row.filename,
            "similarity": float(row.similarity)
        })
    
    return chunks
