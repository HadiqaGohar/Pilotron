import os
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, auth, database, config
from ..services.document import extract_text_from_file, chunk_text, SUPPORTED_FORMATS, MAX_FILE_SIZE
from ..services.chat import get_ai_response
from ..services.embedding import generate_embeddings_batch, search_similar_chunks, generate_embedding

router = APIRouter(prefix="/api/documents", tags=["documents"])

# ========== LIST DOCUMENTS ==========

@router.get("", response_model=List[schemas.Document])
def list_documents(
    search: Optional[str] = None,
    folder_id: Optional[int] = None,
    tag_id: Optional[int] = None,
    sort_by: Optional[str] = "uploaded_at",
    sort_order: Optional[str] = "desc",
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """List user documents with filters."""
    query = db.query(models.Document).filter(models.Document.user_id == current_user.id)
    
    if search:
        query = query.filter(models.Document.filename.ilike(f"%{search}%"))
    if folder_id:
        query = query.filter(models.Document.folder_id == folder_id)
    if tag_id:
        query = query.filter(models.Document.tags.any(models.Tag.id == tag_id))
    
    sort_col = getattr(models.Document, sort_by, models.Document.uploaded_at)
    if sort_order == "asc":
        query = query.order_by(sort_col.asc())
    else:
        query = query.order_by(sort_col.desc())
    
    return query.all()

# ========== FOLDERS ==========

@router.get("/folders")
def list_folders(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.Folder).filter(models.Folder.user_id == current_user.id).all()

@router.post("/folders")
def create_folder(name: str, color: Optional[str] = "#3B82F6", db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    folder = models.Folder(name=name, user_id=current_user.id, color=color)
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return folder

@router.delete("/folders/{folder_id}")
def delete_folder(folder_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    folder = db.query(models.Folder).filter(models.Folder.id == folder_id, models.Folder.user_id == current_user.id).first()
    if not folder:
        raise HTTPException(status_code=404, detail="Folder not found")
    db.query(models.Document).filter(models.Document.folder_id == folder_id).update({"folder_id": None})
    db.delete(folder)
    db.commit()
    return {"message": "Folder deleted"}

# ========== TAGS ==========

@router.get("/tags")
def list_tags(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.Tag).filter(models.Tag.user_id == current_user.id).all()

@router.post("/tags")
def create_tag(name: str, color: Optional[str] = "#10B981", db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    tag = models.Tag(name=name, user_id=current_user.id, color=color)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return tag

@router.delete("/tags/{tag_id}")
def delete_tag(tag_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id, models.Tag.user_id == current_user.id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(tag)
    db.commit()
    return {"message": "Tag deleted"}

# ========== NON-PARAMETERIZED ROUTES ==========

@router.get("/shared-with-me")
def shared_with_me(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    shares = db.query(models.DocumentShare).filter(models.DocumentShare.shared_with_id == current_user.id).all()
    result = []
    for s in shares:
        doc = db.query(models.Document).filter(models.Document.id == s.document_id).first()
        if doc:
            result.append({"id": doc.id, "filename": doc.filename, "file_size": doc.file_size, "uploaded_at": str(doc.uploaded_at), "shared_by": s.shared_by.email, "permission": s.permission})
    return result

@router.get("/history/export")
def export_qa_history(format: str = "text", db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    records = db.query(models.DocumentQA).filter(models.DocumentQA.user_id == current_user.id).order_by(models.DocumentQA.created_at.desc()).all()
    if format == "text":
        lines = ["Pilotron - Q&A History Export", "=" * 40, ""]
        for r in records:
            lines.append(f"Date: {r.created_at}")
            lines.append(f"Q: {r.question}")
            lines.append(f"A: {r.answer}")
            if r.sources:
                lines.append(f"Sources: {r.sources}")
            lines.append("-" * 40)
            lines.append("")
        content = "\n".join(lines)
        return PlainTextResponse(content, headers={"Content-Disposition": "attachment; filename=qa_history.txt"})
    return {"records": records}

@router.get("/history/all")
def get_qa_history(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.DocumentQA).filter(models.DocumentQA.user_id == current_user.id).order_by(models.DocumentQA.created_at.desc()).limit(50).all()

@router.post("/ask-all")
def ask_all_documents(query: schemas.DocumentQuery, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    docs = db.query(models.Document).filter(models.Document.user_id == current_user.id, models.Document.status == "ready").all()
    if not docs:
        raise HTTPException(status_code=404, detail="No documents found")
    
    # Generate query embedding
    query_embedding = generate_embedding(query.query)
    
    # Search across all user's documents using vector similarity
    similar_chunks = search_similar_chunks(db, query_embedding, current_user.id, top_k=8)
    
    if similar_chunks:
        # Group by document for context
        doc_chunks = {}
        for chunk in similar_chunks:
            doc_id = chunk["document_id"]
            if doc_id not in doc_chunks:
                doc_chunks[doc_id] = {"filename": chunk["filename"], "chunks": []}
            doc_chunks[doc_id]["chunks"].append(chunk)
        
        context_parts = []
        doc_sources = []
        for doc_id, data in doc_chunks.items():
            chunks_text = "\n".join([f"[Page {c['page_number']}, Score: {c['similarity']:.2f}] {c['chunk_text']}" for c in data["chunks"]])
            context_parts.append(f"=== {data['filename']} ===\n{chunks_text}")
            doc_sources.append({"document": data["filename"], "doc_id": doc_id, "relevance": round(max(c["similarity"] for c in data["chunks"]), 3)})
        
        combined_context = "\n\n---\n\n".join(context_parts)
    else:
        # Fallback to all documents
        all_context = []
        doc_sources = []
        for doc in docs:
            chunks = db.query(models.DocumentChunk).filter(models.DocumentChunk.document_id == doc.id).order_by(models.DocumentChunk.chunk_index).all()
            context = "\n".join([f"[{doc.filename}, Page {c.page_number}] {c.chunk_text}" for c in chunks])
            all_context.append(context)
            doc_sources.append({"document": doc.filename, "doc_id": doc.id})
        combined_context = "\n\n---\n\n".join(all_context)
    
    answer = get_ai_response([
        {"role": "system", "content": f"""You are a helpful document assistant. Answer questions based on the following documents.
If the answer is not found in any document, say "I couldn't find relevant information in your documents."
Cite which document and page your answer comes from.
Use the relevance scores to prioritize higher-scoring content.

DOCUMENTS:
{combined_context[:10000]}"""},
        {"role": "user", "content": query.query}
    ])
    
    sources = {"documents": doc_sources, "total_chunks_searched": len(similar_chunks)}
    
    qa_record = models.DocumentQA(document_id=None, user_id=current_user.id, question=query.query, answer=answer, sources=sources, is_cross_doc=True)
    db.add(qa_record)
    db.commit()
    return {"answer": answer, "sources": sources}

@router.post("/compare")
def compare_documents(doc_ids: List[int], question: str, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    if len(doc_ids) < 2:
        raise HTTPException(status_code=400, detail="Select at least 2 documents to compare")
    docs = []
    for did in doc_ids:
        doc = db.query(models.Document).filter(models.Document.id == did, models.Document.user_id == current_user.id).first()
        if doc:
            docs.append(doc)
    if len(docs) < 2:
        raise HTTPException(status_code=404, detail="Documents not found")
    all_context = []
    for doc in docs:
        chunks = db.query(models.DocumentChunk).filter(models.DocumentChunk.document_id == doc.id).order_by(models.DocumentChunk.chunk_index).all()
        context = "\n".join([c.chunk_text for c in chunks])
        all_context.append(f"=== {doc.filename} ===\n{context}")
    combined = "\n\n".join(all_context)
    answer = get_ai_response([
        {"role": "system", "content": f"""Compare the following documents and answer the question.
Highlight similarities, differences, and key points from each document.

DOCUMENTS:
{combined[:10000]}"""},
        {"role": "user", "content": question}
    ])
    return {"answer": answer, "documents": [d.filename for d in docs]}

@router.post("/upload", response_model=schemas.Document)
async def upload_document(file: UploadFile = File(...), folder_id: Optional[int] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in SUPPORTED_FORMATS:
        raise HTTPException(status_code=400, detail=f"Unsupported format. Allowed: {', '.join(SUPPORTED_FORMATS)}")
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Max size: {MAX_FILE_SIZE // (1024*1024)}MB")
    file_path = os.path.join(config.STORAGE_PATH, file.filename)
    with open(file_path, "wb") as buffer:
        buffer.write(content)
    db_doc = models.Document(filename=file.filename, user_id=current_user.id, file_size=len(content), status="processing", folder_id=folder_id)
    db.add(db_doc)
    db.commit()
    db.refresh(db_doc)
    try:
        pages = extract_text_from_file(file_path)
        chunks = chunk_text(pages)
        db_doc.total_chunks = len(chunks)
        
        # Generate embeddings for all chunks
        chunk_texts = [c["chunk_text"] for c in chunks]
        embeddings = generate_embeddings_batch(chunk_texts)
        
        db_doc.status = "ready"
        for i, chunk_data in enumerate(chunks):
            db_chunk = models.DocumentChunk(
                document_id=db_doc.id,
                chunk_text=chunk_data["chunk_text"],
                chunk_index=chunk_data["chunk_index"],
                page_number=chunk_data["page_number"],
                embedding=embeddings[i]
            )
            db.add(db_chunk)
        db.commit()
        db.refresh(db_doc)
        
        # Auto-tag: generate tags based on document content
        try:
            auto_tags = generate_auto_tags(db, db_doc, chunk_texts[:3], current_user.id)
            if auto_tags:
                print(f"[upload] Auto-tagged '{file.filename}' with: {auto_tags}")
        except Exception as e:
            print(f"[upload] Auto-tagging failed: {e}")
            
    except Exception as e:
        db_doc.status = "failed"
        db_doc.error_message = str(e)
        db.commit()
    return db_doc


def generate_auto_tags(db: Session, doc: models.Document, sample_texts: list[str], user_id: int) -> list[str]:
    """Auto-generate tags for a document using AI."""
    combined = "\n".join(sample_texts)[:2000]
    prompt = f"""Analyze this document content and suggest 2-4 short tags/categories for it.
Return ONLY a comma-separated list of tags, nothing else.
Example: Finance, Report, Q3-2024

DOCUMENT CONTENT:
{combined}"""
    
    response = get_ai_response([
        {"role": "system", "content": "You are a document classifier. Return only comma-separated tags."},
        {"role": "user", "content": prompt}
    ])
    
    if not response or "sorry" in response.lower() or "error" in response.lower():
        return []
    
    tag_names = [t.strip().lower() for t in response.split(",") if t.strip()]
    tag_names = tag_names[:4]
    
    for tag_name in tag_names:
        # Check if tag exists
        existing_tag = db.query(models.Tag).filter(
            models.Tag.name == tag_name,
            models.Tag.user_id == user_id
        ).first()
        
        if not existing_tag:
            colors = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"]
            color = colors[hash(tag_name) % len(colors)]
            existing_tag = models.Tag(name=tag_name, user_id=user_id, color=color)
            db.add(existing_tag)
            db.flush()
        
        if existing_tag not in doc.tags:
            doc.tags.append(existing_tag)
    
    db.commit()
    return tag_names

# ========== PARAMETERIZED ROUTES (must come after static routes) ==========

@router.get("/{document_id}")
def get_document(document_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == document_id, models.Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    chunks = db.query(models.DocumentChunk).filter(models.DocumentChunk.document_id == document_id).order_by(models.DocumentChunk.chunk_index).all()
    full_text = "\n\n".join([c.chunk_text for c in chunks])
    pages = {}
    for c in chunks:
        pg = c.page_number or 1
        if pg not in pages:
            pages[pg] = []
        pages[pg].append(c.chunk_text)
    page_list = [{"page_number": k, "text": "\n\n".join(v)} for k, v in sorted(pages.items())]
    tags = [{"id": t.id, "name": t.name, "color": t.color} for t in doc.tags]
    return {"id": doc.id, "filename": doc.filename, "uploaded_at": str(doc.uploaded_at), "file_size": doc.file_size, "total_chunks": doc.total_chunks, "status": doc.status, "error_message": doc.error_message, "content": full_text[:10000], "pages": page_list, "folder_id": doc.folder_id, "tags": tags}

@router.get("/{document_id}/content")
def get_document_content(document_id: int, page: Optional[int] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == document_id, models.Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    query = db.query(models.DocumentChunk).filter(models.DocumentChunk.document_id == document_id)
    if page:
        query = query.filter(models.DocumentChunk.page_number == page)
    chunks = query.order_by(models.DocumentChunk.chunk_index).all()
    return {"content": "\n\n".join([c.chunk_text for c in chunks]), "total_pages": max([c.page_number for c in chunks]) if chunks else 1}

@router.get("/{document_id}/history")
def get_document_qa_history(document_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.DocumentQA).filter(models.DocumentQA.document_id == document_id, models.DocumentQA.user_id == current_user.id).order_by(models.DocumentQA.created_at.desc()).limit(50).all()

@router.get("/{document_id}/shares")
def list_shares(document_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    shares = db.query(models.DocumentShare).filter(models.DocumentShare.document_id == document_id).all()
    return [{"email": s.shared_with.email, "permission": s.permission, "shared_by": s.shared_by.email, "user_id": s.shared_with_id} for s in shares]

@router.post("/{document_id}/ask")
def ask_document(document_id: int, query: schemas.DocumentQuery, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == document_id, models.Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Generate query embedding
    query_embedding = generate_embedding(query.query)
    
    # Search for similar chunks using vector similarity
    similar_chunks = search_similar_chunks(db, query_embedding, current_user.id, document_id=document_id, top_k=5)
    
    if similar_chunks:
        # Build context from similar chunks with relevance scores
        context_parts = []
        for chunk in similar_chunks:
            score = chunk["similarity"]
            context_parts.append(f"[Page {chunk['page_number']}, Relevance: {score:.2f}] {chunk['chunk_text']}")
        context = "\n\n".join(context_parts)
    else:
        # Fallback to all chunks if no embeddings
        chunks = db.query(models.DocumentChunk).filter(models.DocumentChunk.document_id == document_id).order_by(models.DocumentChunk.chunk_index).all()
        context = "\n\n".join([f"[Page {c.page_number}] {c.chunk_text}" for c in chunks])
    
    answer = get_ai_response([
        {"role": "system", "content": f"""You are a helpful document assistant. Answer questions based ONLY on the document content below.
If the answer is not in the document, say "I couldn't find relevant information in this document."
Always cite which page/section your answer comes from.
Use the relevance scores to prioritize higher-scoring content.

DOCUMENT CONTENT:
{context[:8000]}"""},
        {"role": "user", "content": query.query}
    ])
    
    sources = {"document": doc.filename, "pages": list(set([c["page_number"] for c in similar_chunks if c["page_number"]]))}
    if similar_chunks:
        sources["relevance_scores"] = [round(c["similarity"], 3) for c in similar_chunks]
    
    qa_record = models.DocumentQA(document_id=document_id, user_id=current_user.id, question=query.query, answer=answer, sources=sources, is_cross_doc=False)
    db.add(qa_record)
    db.commit()
    return {"answer": answer, "sources": sources, "chunks_found": len(similar_chunks)}

@router.post("/{document_id}/summarize")
def summarize_document(document_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == document_id, models.Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    chunks = db.query(models.DocumentChunk).filter(models.DocumentChunk.document_id == document_id).order_by(models.DocumentChunk.chunk_index).all()
    context = "\n".join([c.chunk_text for c in chunks])
    summary = get_ai_response([{"role": "system", "content": "Summarize the following document in clear, concise paragraphs. Use markdown with headers and bullet points."}, {"role": "user", "content": f"Summarize this document:\n\n{context[:8000]}"}])
    return {"summary": summary}

@router.post("/{document_id}/keypoints")
def extract_keypoints(document_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == document_id, models.Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    chunks = db.query(models.DocumentChunk).filter(models.DocumentChunk.document_id == document_id).order_by(models.DocumentChunk.chunk_index).all()
    context = "\n".join([c.chunk_text for c in chunks])
    keypoints = get_ai_response([{"role": "system", "content": "Extract key points from this document as a numbered list with brief explanations."}, {"role": "user", "content": f"Extract key points:\n\n{context[:8000]}"}])
    return {"keypoints": keypoints}

@router.post("/{document_id}/tags/{tag_id}")
def add_tag_to_document(document_id: int, tag_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == document_id, models.Document.user_id == current_user.id).first()
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id, models.Tag.user_id == current_user.id).first()
    if not doc or not tag:
        raise HTTPException(status_code=404, detail="Not found")
    if tag not in doc.tags:
        doc.tags.append(tag)
        db.commit()
    return {"message": "Tag added"}

@router.delete("/{document_id}/tags/{tag_id}")
def remove_tag_from_document(document_id: int, tag_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == document_id, models.Document.user_id == current_user.id).first()
    tag = db.query(models.Tag).filter(models.Tag.id == tag_id, models.Tag.user_id == current_user.id).first()
    if not doc or not tag:
        raise HTTPException(status_code=404, detail="Not found")
    if tag in doc.tags:
        doc.tags.remove(tag)
        db.commit()
    return {"message": "Tag removed"}

@router.post("/{document_id}/move")
def move_document(document_id: int, folder_id: Optional[int] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == document_id, models.Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    doc.folder_id = folder_id if folder_id else None
    db.commit()
    return {"message": "Document moved"}

@router.post("/{document_id}/share")
def share_document(document_id: int, email: str, permission: str = "view", db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == document_id, models.Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    target_user = db.query(models.User).filter(models.User.email == email).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    if target_user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot share with yourself")
    existing = db.query(models.DocumentShare).filter(models.DocumentShare.document_id == document_id, models.DocumentShare.shared_with_id == target_user.id).first()
    if existing:
        existing.permission = permission
    else:
        share = models.DocumentShare(document_id=document_id, shared_with_id=target_user.id, shared_by_id=current_user.id, permission=permission)
        db.add(share)
    db.commit()
    return {"message": f"Shared with {email}"}

@router.delete("/{document_id}/shares/{user_id}")
def remove_share(document_id: int, user_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    share = db.query(models.DocumentShare).filter(models.DocumentShare.document_id == document_id, models.DocumentShare.shared_with_id == user_id).first()
    if share:
        db.delete(share)
        db.commit()
    return {"message": "Share removed"}

@router.delete("/{document_id}")
def delete_document(document_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    doc = db.query(models.Document).filter(models.Document.id == document_id, models.Document.user_id == current_user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    file_path = os.path.join(config.STORAGE_PATH, doc.filename)
    if os.path.exists(file_path):
        os.remove(file_path)
    db.query(models.DocumentShare).filter(models.DocumentShare.document_id == document_id).delete()
    db.query(models.DocumentQA).filter(models.DocumentQA.document_id == document_id).delete()
    db.query(models.DocumentChunk).filter(models.DocumentChunk.document_id == document_id).delete()
    db.delete(doc)
    db.commit()
    return {"message": "Document deleted successfully"}
