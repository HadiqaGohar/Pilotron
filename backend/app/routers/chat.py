from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse, PlainTextResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from .. import models, schemas, auth, database, config
from ..services.chat import get_ai_response, get_ai_response_stream, generate_chat_title, detect_task_action, MODEL_OPTIONS, parse_task_datetime
from ..services.document import extract_text_from_file

import json
import re as _re

def _match_task_by_keywords(keywords: str, task_title: str) -> bool:
    """Match task by checking if significant words from keywords appear in task title."""
    stopwords = {'the', 'a', 'an', 'my', 'your', 'his', 'her', 'its', 'our', 'their',
                 'is', 'are', 'was', 'were', 'be', 'been', 'being',
                 'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from',
                 'and', 'or', 'but', 'not', 'no', 'so', 'if', 'then',
                 'this', 'that', 'these', 'those', 'it', 'he', 'she', 'they',
                 'i', 'you', 'we', 'me', 'him', 'us', 'them',
                 'do', 'does', 'did', 'have', 'has', 'had',
                 'can', 'could', 'should', 'would', 'may', 'might', 'shall', 'will',
                 'please', 'ok', 'list', 'task', 'tasks', 'update', 'mark', 'set',
                 'make', 'put', 'move', 'change', 'add', 'log', 'currently', 'now', 'as'}
    kw_words = set(_re.findall(r'\b[a-z]{2,}\b', keywords.lower())) - stopwords
    title_words = set(_re.findall(r'\b[a-z]{2,}\b', task_title.lower())) - stopwords
    if not kw_words:
        return False
    matches = kw_words & title_words
    return len(matches) >= max(1, len(kw_words) // 2)
import os

router = APIRouter(prefix="/api/chat", tags=["chat"])

# ========== SESSIONS ==========

@router.get("/sessions", response_model=List[schemas.ChatSession])
def list_sessions(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.ChatSession).filter(
        models.ChatSession.user_id == current_user.id
    ).order_by(
        models.ChatSession.is_pinned.desc(),
        models.ChatSession.created_at.desc()
    ).all()

@router.post("/sessions", response_model=schemas.ChatSession)
def create_session(session: schemas.ChatSessionCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    new_session = models.ChatSession(title=session.title, user_id=current_user.id)
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    return new_session

@router.patch("/sessions/{session_id}", response_model=schemas.ChatSession)
def update_session(session_id: int, update: schemas.ChatSessionUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    session = db.query(models.ChatSession).filter(
        models.ChatSession.id == session_id,
        models.ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if update.title is not None:
        session.title = update.title
    if update.is_pinned is not None:
        session.is_pinned = update.is_pinned
    
    db.commit()
    db.refresh(session)
    return session

@router.delete("/sessions/{session_id}")
def delete_session(session_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    session = db.query(models.ChatSession).filter(
        models.ChatSession.id == session_id,
        models.ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Delete all messages first
    db.query(models.ChatMessage).filter(models.ChatMessage.session_id == session_id).delete()
    db.delete(session)
    db.commit()
    return {"message": "Session deleted"}

# ========== MESSAGES ==========

@router.get("/sessions/{session_id}/messages", response_model=List[schemas.ChatMessage])
def get_messages(session_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    session = db.query(models.ChatSession).filter(
        models.ChatSession.id == session_id,
        models.ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return db.query(models.ChatMessage).filter(
        models.ChatMessage.session_id == session_id
    ).order_by(models.ChatMessage.created_at.asc()).all()

@router.post("/sessions/{session_id}/messages")
def send_message(session_id: int, message: schemas.ChatMessageCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    session = db.query(models.ChatSession).filter(
        models.ChatSession.id == session_id,
        models.ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Save user message
    user_message = models.ChatMessage(session_id=session_id, role="user", content=message.content)
    db.add(user_message)
    db.flush()

    # Auto-name on first message
    message_count = db.query(models.ChatMessage).filter(models.ChatMessage.session_id == session_id).count()
    if message_count == 1:
        new_title = generate_chat_title(message.content)
        session.title = new_title
        db.add(session)

    # Detect task actions
    task_action = detect_task_action(message.content)
    task_info = None

    if task_action.get("action") == "create":
        title = task_action.get("title", message.content[:50])
        due_date = None
        reminder_at = None
        if task_action.get("due_date"):
            try:
                due_date = datetime.fromisoformat(task_action["due_date"].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                due_date = None
        if not due_date:
            due_date, reminder_at = parse_task_datetime(message.content)
        elif due_date and not reminder_at:
            reminder_at = due_date - __import__('datetime').timedelta(minutes=15)
        initial_status = task_action.get("status", "todo")
        new_task = models.Task(title=title, description=task_action.get("description"), status=initial_status, due_date=due_date, reminder_at=reminder_at, user_id=current_user.id)
        db.add(new_task)
        db.flush()
        if initial_status == "in_progress":
            task_info = {"action": "created_and_progress", "task_id": new_task.id, "title": new_task.title, "due_date": due_date}
        elif initial_status == "done":
            task_info = {"action": "created_and_done", "task_id": new_task.id, "title": new_task.title, "due_date": due_date}
        else:
            task_info = {"action": "created", "task_id": new_task.id, "title": new_task.title, "due_date": due_date}

    elif task_action.get("action") == "complete":
        keywords = task_action.get("title_keywords", "").lower()
        all_tasks = db.query(models.Task).filter(models.Task.user_id == current_user.id).all()
        for t in all_tasks:
            if _match_task_by_keywords(keywords, t.title):
                if t.status == "done":
                    task_info = {"action": "already_done", "task_id": t.id, "title": t.title}
                else:
                    t.status = "done"
                    db.flush()
                    task_info = {"action": "completed", "task_id": t.id, "title": t.title}
                break

    elif task_action.get("action") == "progress":
        keywords = task_action.get("title_keywords", "").lower()
        all_tasks = db.query(models.Task).filter(models.Task.user_id == current_user.id).all()
        for t in all_tasks:
            if _match_task_by_keywords(keywords, t.title):
                if t.status == "in_progress":
                    task_info = {"action": "already_in_progress", "task_id": t.id, "title": t.title}
                else:
                    t.status = "in_progress"
                    db.flush()
                    task_info = {"action": "in_progress", "task_id": t.id, "title": t.title}
                break

    elif task_action.get("action") == "pending":
        keywords = task_action.get("title_keywords", "").lower()
        all_tasks = db.query(models.Task).filter(models.Task.user_id == current_user.id).all()
        for t in all_tasks:
            if _match_task_by_keywords(keywords, t.title):
                if t.status == "todo":
                    task_info = {"action": "already_pending", "task_id": t.id, "title": t.title}
                else:
                    t.status = "todo"
                    db.flush()
                    task_info = {"action": "pending", "task_id": t.id, "title": t.title}
                break

    elif task_action.get("action") == "list_tasks":
        # Fetch actual tasks from database
        all_tasks = db.query(models.Task).filter(models.Task.user_id == current_user.id).all()
        if not all_tasks:
            ai_response = "You don't have any tasks yet."
        else:
            pending = [t for t in all_tasks if t.status == "todo"]
            in_progress = [t for t in all_tasks if t.status == "in_progress"]
            done = [t for t in all_tasks if t.status == "done"]
            lines = []
            if pending:
                lines.append("**Pending:**")
                for t in pending:
                    due = f" (due {t.due_date.strftime('%b %d')})" if t.due_date else ""
                    lines.append(f"  - {t.title}{due}")
            if in_progress:
                lines.append("**In Progress:**")
                for t in in_progress:
                    due = f" (due {t.due_date.strftime('%b %d')})" if t.due_date else ""
                    lines.append(f"  - {t.title}{due}")
            if done:
                lines.append("**Completed:**")
                for t in done[:5]:
                    lines.append(f"  - ~~{t.title}~~")
                if len(done) > 5:
                    lines.append(f"  - ...and {len(done)-5} more")
            ai_response = "\n".join(lines)

    # Get AI response with context (skip if list_tasks already handled)
    if task_action.get("action") != "list_tasks":
        history = db.query(models.ChatMessage).filter(
            models.ChatMessage.session_id == session_id
        ).order_by(models.ChatMessage.created_at.asc()).all()
        
        # Limit context to last 20 messages
        recent_history = history[-20:] if len(history) > 20 else history
        ai_messages = [{"role": m.role, "content": m.content} for m in recent_history]

    if task_info:
        # Task action detected and executed — skip AI, generate natural response directly
        action = task_info["action"]
        title = task_info["title"]
        due = task_info.get("due_date")
        time_str = f" at {due.strftime('%I:%M %p')}" if due and due.hour != 9 else ""
        date_str = f" on {due.strftime('%b %d')}" if due else ""
        natural_responses = {
            "created": f"Done! I've created a task: \"{title}\"{date_str}{time_str}.",
            "created_and_progress": f"Done! I've created the task \"{title}\" and marked it as in progress{date_str}{time_str}.",
            "created_and_done": f"Done! I've created and completed the task \"{title}\"{date_str}{time_str}.",
            "completed": f"Done! I've marked \"{title}\" as completed.",
            "in_progress": f"Got it — \"{title}\" is now in progress.",
            "pending": f"Done — \"{title}\" has been set to pending.",
            "already_done": f"\"{title}\" is already completed.",
            "already_in_progress": f"\"{title}\" is already in progress.",
            "already_pending": f"\"{title}\" is already pending.",
        }
        ai_response = natural_responses.get(action, f"Task action '{action}' performed on \"{title}\".")
    else:
        ai_response = get_ai_response(ai_messages)

    # Append task info
    if task_info:
        action = task_info["action"]
        title = task_info["title"]
        task_msgs = {
            "created": f"\n\n✅ Task created: \"{title}\"",
            "created_and_progress": f"\n\n✅ Task created: \"{title}\"\n🔄 Task set to in progress",
            "created_and_done": f"\n\n✅ Task created and completed: \"{title}\"",
            "completed": f"\n\n✅ Task completed: \"{title}\"",
            "in_progress": f"\n\n🔄 Task in progress: \"{title}\"",
            "pending": f"\n\n⏳ Task set to pending: \"{title}\"",
            "already_done": f"\n\nℹ️ Task \"{title}\" is already completed.",
            "already_in_progress": f"\n\nℹ️ Task \"{title}\" is already in progress.",
            "already_pending": f"\n\nℹ️ Task \"{title}\" is already pending.",
        }
        ai_response += task_msgs.get(action, "")

    ai_message = models.ChatMessage(session_id=session_id, role="assistant", content=ai_response)
    db.add(ai_message)
    db.commit()
    db.refresh(ai_message)
    return {"content": ai_message.content, "task": task_info, "message_id": ai_message.id}

# ========== STREAMING MESSAGE ==========

@router.get("/models")
def list_models():
    """List available AI model options."""
    return [{"id": k, "name": v["name"], "provider": v["provider"]} for k, v in MODEL_OPTIONS.items()]

@router.post("/sessions/{session_id}/messages/stream")
def stream_message(session_id: int, message: schemas.ChatMessageCreate, model: Optional[str] = "auto", db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Send message and stream AI response via SSE."""
    session = db.query(models.ChatSession).filter(
        models.ChatSession.id == session_id,
        models.ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Save user message
    user_message = models.ChatMessage(session_id=session_id, role="user", content=message.content)
    db.add(user_message)
    db.flush()

    # Auto-name on first message
    message_count = db.query(models.ChatMessage).filter(models.ChatMessage.session_id == session_id).count()
    if message_count == 1:
        new_title = generate_chat_title(message.content)
        session.title = new_title
        db.add(session)

    # Detect task actions
    task_action = detect_task_action(message.content)
    task_info = None

    if task_action.get("action") == "create":
        title = task_action.get("title", message.content[:50])
        due_date = None
        reminder_at = None
        if task_action.get("due_date"):
            try:
                due_date = datetime.fromisoformat(task_action["due_date"].replace("Z", "+00:00"))
            except (ValueError, TypeError):
                due_date = None
        if not due_date:
            due_date, reminder_at = parse_task_datetime(message.content)
        elif due_date and not reminder_at:
            reminder_at = due_date - __import__('datetime').timedelta(minutes=15)
        initial_status = task_action.get("status", "todo")
        new_task = models.Task(title=title, description=task_action.get("description"), status=initial_status, due_date=due_date, reminder_at=reminder_at, user_id=current_user.id)
        db.add(new_task)
        db.flush()
        if initial_status == "in_progress":
            task_info = {"action": "created_and_progress", "task_id": new_task.id, "title": new_task.title, "due_date": due_date}
        elif initial_status == "done":
            task_info = {"action": "created_and_done", "task_id": new_task.id, "title": new_task.title, "due_date": due_date}
        else:
            task_info = {"action": "created", "task_id": new_task.id, "title": new_task.title, "due_date": due_date}

    elif task_action.get("action") == "complete":
        keywords = task_action.get("title_keywords", "").lower()
        all_tasks = db.query(models.Task).filter(models.Task.user_id == current_user.id).all()
        for t in all_tasks:
            if _match_task_by_keywords(keywords, t.title):
                if t.status == "done":
                    task_info = {"action": "already_done", "task_id": t.id, "title": t.title}
                else:
                    t.status = "done"
                    db.flush()
                    task_info = {"action": "completed", "task_id": t.id, "title": t.title}
                break

    elif task_action.get("action") == "progress":
        keywords = task_action.get("title_keywords", "").lower()
        all_tasks = db.query(models.Task).filter(models.Task.user_id == current_user.id).all()
        for t in all_tasks:
            if _match_task_by_keywords(keywords, t.title):
                if t.status == "in_progress":
                    task_info = {"action": "already_in_progress", "task_id": t.id, "title": t.title}
                else:
                    t.status = "in_progress"
                    db.flush()
                    task_info = {"action": "in_progress", "task_id": t.id, "title": t.title}
                break

    elif task_action.get("action") == "pending":
        keywords = task_action.get("title_keywords", "").lower()
        all_tasks = db.query(models.Task).filter(models.Task.user_id == current_user.id).all()
        for t in all_tasks:
            if _match_task_by_keywords(keywords, t.title):
                if t.status == "todo":
                    task_info = {"action": "already_pending", "task_id": t.id, "title": t.title}
                else:
                    t.status = "todo"
                    db.flush()
                    task_info = {"action": "pending", "task_id": t.id, "title": t.title}
                break

    elif task_action.get("action") == "list_tasks":
        all_tasks = db.query(models.Task).filter(models.Task.user_id == current_user.id).all()
        if not all_tasks:
            natural_response = "You don't have any tasks yet."
        else:
            pending = [t for t in all_tasks if t.status == "todo"]
            in_prog = [t for t in all_tasks if t.status == "in_progress"]
            done = [t for t in all_tasks if t.status == "done"]
            lines = []
            if pending:
                lines.append("Pending:")
                for t in pending:
                    due = f" (due {t.due_date.strftime('%b %d')})" if t.due_date else ""
                    lines.append(f"  - {t.title}{due}")
            if in_prog:
                lines.append("In Progress:")
                for t in in_prog:
                    due = f" (due {t.due_date.strftime('%b %d')})" if t.due_date else ""
                    lines.append(f"  - {t.title}{due}")
            if done:
                lines.append("Completed:")
                for t in done[:5]:
                    lines.append(f"  - {t.title}")
                if len(done) > 5:
                    lines.append(f"  - ...and {len(done)-5} more")
            natural_response = "\n".join(lines)

    # Get history for context
    history = db.query(models.ChatMessage).filter(
        models.ChatMessage.session_id == session_id
    ).order_by(models.ChatMessage.created_at.asc()).all()
    
    recent_history = history[-20:] if len(history) > 20 else history
    ai_messages = [{"role": m.role, "content": m.content} for m in recent_history]

    # Build task suffix and natural response
    task_suffix = ""
    natural_response = None
    if task_info:
        action = task_info["action"]
        title = task_info["title"]
        task_msgs = {
            "created": f"\n\n✅ Task created: \"{title}\"",
            "created_and_progress": f"\n\n✅ Task created: \"{title}\"\n🔄 Task set to in progress",
            "created_and_done": f"\n\n✅ Task created and completed: \"{title}\"",
            "completed": f"\n\n✅ Task completed: \"{title}\"",
            "in_progress": f"\n\n🔄 Task in progress: \"{title}\"",
            "pending": f"\n\n⏳ Task set to pending: \"{title}\"",
            "already_done": f"\n\nℹ️ Task \"{title}\" is already completed.",
            "already_in_progress": f"\n\nℹ️ Task \"{title}\" is already in progress.",
            "already_pending": f"\n\nℹ️ Task \"{title}\" is already pending.",
        }
        task_suffix = task_msgs.get(action, "")
        natural_responses = {
            "created": f"Done! I've created a task: \"{title}\".",
            "created_and_progress": f"Done! I've created the task \"{title}\" and marked it as in progress.",
            "created_and_done": f"Done! I've created and completed the task \"{title}\".",
            "completed": f"Done! I've marked \"{title}\" as completed.",
            "in_progress": f"Got it — \"{title}\" is now in progress.",
            "pending": f"Done — \"{title}\" has been set to pending.",
            "already_done": f"\"{title}\" is already completed.",
            "already_in_progress": f"\"{title}\" is already in progress.",
            "already_pending": f"\"{title}\" is already pending.",
        }
        natural_response = natural_responses.get(action, f"Task action '{action}' performed on \"{title}\".")

    def event_stream():
        full_response = ""
        try:
            if natural_response:
                # Task action handled — skip AI, stream natural response directly
                for word in natural_response.split(" "):
                    full_response += word + " "
                    yield f"data: {json.dumps({'type': 'token', 'content': word + ' '})}\n\n"
            else:
                for token in get_ai_response_stream(ai_messages, model_choice=model):
                    full_response += token
                    yield f"data: {json.dumps({'type': 'token', 'content': token})}\n\n"
            
            # Save complete response
            ai_message = models.ChatMessage(session_id=session_id, role="assistant", content=full_response + task_suffix)
            db.add(ai_message)
            db.commit()
            db.refresh(ai_message)
            
            # Send final event with task info and message id
            yield f"data: {json.dumps({'type': 'done', 'message_id': ai_message.id, 'task': task_info, 'content': full_response + task_suffix})}\n\n"
        except Exception as e:
            print(f"Stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'content': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    })

@router.patch("/messages/{message_id}")
def edit_message(message_id: int, edit: schemas.MessageEdit, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    message = db.query(models.ChatMessage).filter(models.ChatMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Verify ownership through session
    session = db.query(models.ChatSession).filter(
        models.ChatSession.id == message.session_id,
        models.ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Update message
    message.content = edit.content
    db.flush()
    
    # Delete all messages after this one (regenerate conversation)
    db.query(models.ChatMessage).filter(
        models.ChatMessage.session_id == message.session_id,
        models.ChatMessage.id > message_id
    ).delete()
    db.flush()
    
    # Generate new AI response
    history = db.query(models.ChatMessage).filter(
        models.ChatMessage.session_id == message.session_id
    ).order_by(models.ChatMessage.created_at.asc()).all()
    
    recent_history = history[-20:] if len(history) > 20 else history
    ai_messages = [{"role": m.role, "content": m.content} for m in recent_history]
    ai_response = get_ai_response(ai_messages)
    
    ai_message = models.ChatMessage(session_id=message.session_id, role="assistant", content=ai_response)
    db.add(ai_message)
    db.commit()
    db.refresh(ai_message)
    return {"content": ai_response, "message_id": ai_message.id}

@router.post("/messages/{message_id}/regenerate")
def regenerate_message(message_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    message = db.query(models.ChatMessage).filter(models.ChatMessage.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    
    session = db.query(models.ChatSession).filter(
        models.ChatSession.id == message.session_id,
        models.ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Delete this and all subsequent messages
    db.query(models.ChatMessage).filter(
        models.ChatMessage.session_id == message.session_id,
        models.ChatMessage.id >= message_id
    ).delete()
    db.flush()
    
    # Get history up to this point
    history = db.query(models.ChatMessage).filter(
        models.ChatMessage.session_id == message.session_id
    ).order_by(models.ChatMessage.created_at.asc()).all()
    
    recent_history = history[-20:] if len(history) > 20 else history
    ai_messages = [{"role": m.role, "content": m.content} for m in recent_history]
    ai_response = get_ai_response(ai_messages)
    
    ai_message = models.ChatMessage(session_id=message.session_id, role="assistant", content=ai_response)
    db.add(ai_message)
    db.commit()
    db.refresh(ai_message)
    return {"content": ai_response, "message_id": ai_message.id}

# ========== FILE ATTACHMENT ==========

@router.post("/attachments")
async def upload_attachment(file: bytes = None, filename: str = "", db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Upload a file and extract text for chat context."""
    if not file:
        raise HTTPException(status_code=400, detail="No file provided")
    
    # Save temp file
    ext = os.path.splitext(filename)[1].lower()
    supported = {'.pdf', '.txt', '.csv', '.md', '.docx'}
    if ext not in supported:
        raise HTTPException(status_code=400, detail=f"Unsupported format. Allowed: {', '.join(supported)}")
    
    temp_path = os.path.join(config.STORAGE_PATH, f"chat_{filename}")
    with open(temp_path, "wb") as f:
        f.write(file)
    
    try:
        pages = extract_text_from_file(temp_path)
        text = "\n\n".join([p["text"] for p in pages])
        # Limit text
        if len(text) > 5000:
            text = text[:5000] + "\n...[truncated]"
        return {"filename": filename, "text": text}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to extract text: {str(e)}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

# ========== EXPORT ==========

@router.get("/sessions/{session_id}/export")
def export_session(session_id: int, format: str = "text", db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    session = db.query(models.ChatSession).filter(
        models.ChatSession.id == session_id,
        models.ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    messages = db.query(models.ChatMessage).filter(
        models.ChatMessage.session_id == session_id
    ).order_by(models.ChatMessage.created_at.asc()).all()
    
    if format == "text":
        lines = [f"Pilotron Chat Export - {session.title}", "=" * 50, ""]
        for m in messages:
            role = "You" if m.role == "user" else "AI"
            lines.append(f"[{role}]: {m.content}")
            lines.append("")
        content = "\n".join(lines)
        return PlainTextResponse(content, headers={
            "Content-Disposition": f"attachment; filename=chat_{session_id}.txt"
        })
    
    # JSON format
    return {
        "session": {"id": session.id, "title": session.title, "created_at": str(session.created_at)},
        "messages": [{"role": m.role, "content": m.content, "created_at": str(m.created_at)} for m in messages]
    }
