from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta
from .. import models, auth, database

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

@router.get("/stats")
def get_dashboard_stats(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    uid = current_user.id

    # Tasks
    all_tasks = db.query(models.Task).filter(models.Task.user_id == uid).all()
    total_tasks = len(all_tasks)
    todo_tasks = sum(1 for t in all_tasks if t.status == "todo")
    in_progress_tasks = sum(1 for t in all_tasks if t.status == "in_progress")
    done_tasks = sum(1 for t in all_tasks if t.status == "done")
    completion_rate = round((done_tasks / total_tasks * 100) if total_tasks > 0 else 0)

    # Tasks created in last 7 days
    week_ago = datetime.utcnow() - timedelta(days=7)
    recent_tasks = db.query(models.Task).filter(
        models.Task.user_id == uid,
        models.Task.created_at >= week_ago
    ).count()

    # Tasks created per day (last 7 days) for chart
    task_chart = []
    for i in range(6, -1, -1):
        day = datetime.utcnow().date() - timedelta(days=i)
        day_start = datetime.combine(day, datetime.min.time())
        day_end = datetime.combine(day, datetime.max.time())
        count = db.query(models.Task).filter(
            models.Task.user_id == uid,
            models.Task.created_at >= day_start,
            models.Task.created_at <= day_end
        ).count()
        task_chart.append({"day": day.strftime("%a"), "count": count})

    # Documents
    total_docs = db.query(models.Document).filter(models.Document.user_id == uid).count()
    ready_docs = db.query(models.Document).filter(models.Document.user_id == uid, models.Document.status == "ready").count()
    processing_docs = db.query(models.Document).filter(models.Document.user_id == uid, models.Document.status == "processing").count()
    total_doc_size = db.query(func.coalesce(func.sum(models.Document.file_size), 0)).filter(models.Document.user_id == uid).scalar()

    # Recent documents
    recent_docs = db.query(models.Document).filter(models.Document.user_id == uid).order_by(models.Document.uploaded_at.desc()).limit(5).all()

    # Chat sessions
    total_sessions = db.query(models.ChatSession).filter(models.ChatSession.user_id == uid).count()
    total_messages = db.query(models.ChatMessage).join(models.ChatSession).filter(models.ChatSession.user_id == uid).count()

    # Recent chat sessions
    recent_sessions = db.query(models.ChatSession).filter(models.ChatSession.user_id == uid).order_by(models.ChatSession.created_at.desc()).limit(5).all()

    # Notifications
    total_notifs = db.query(models.Notification).filter(models.Notification.user_id == uid).count()
    unread_notifs = db.query(models.Notification).filter(models.Notification.user_id == uid, models.Notification.is_read == False).count()
    recent_notifs = db.query(models.Notification).filter(models.Notification.user_id == uid).order_by(models.Notification.created_at.desc()).limit(5).all()

    # Q&A History
    total_qa = db.query(models.DocumentQA).filter(models.DocumentQA.user_id == uid).count()

    # Suggestions
    total_suggestions = db.query(models.Suggestion).filter(models.Suggestion.user_id == uid).count()
    active_suggestions = db.query(models.Suggestion).filter(
        models.Suggestion.user_id == uid,
        models.Suggestion.is_dismissed == False,
        models.Suggestion.feedback == None
    ).count()

    # Workflows
    total_workflows = db.query(models.Workflow).filter(models.Workflow.user_id == uid).count()
    active_workflows = db.query(models.Workflow).filter(models.Workflow.user_id == uid, models.Workflow.is_active == True).count()

    # Productivity score (simple: based on completion rate + activity)
    productivity_score = min(100, completion_rate + (recent_tasks * 5) + (total_qa * 2))

    return {
        "tasks": {
            "total": total_tasks,
            "todo": todo_tasks,
            "in_progress": in_progress_tasks,
            "done": done_tasks,
            "completion_rate": completion_rate,
            "recent_7d": recent_tasks,
            "chart": task_chart,
        },
        "documents": {
            "total": total_docs,
            "ready": ready_docs,
            "processing": processing_docs,
            "total_size_bytes": total_doc_size,
            "recent": [
                {"id": d.id, "filename": d.filename, "file_size": d.file_size, "status": d.status, "uploaded_at": str(d.uploaded_at)}
                for d in recent_docs
            ],
        },
        "chat": {
            "total_sessions": total_sessions,
            "total_messages": total_messages,
            "recent": [
                {"id": s.id, "title": s.title, "created_at": str(s.created_at), "message_count": len(s.messages)}
                for s in recent_sessions
            ],
        },
        "notifications": {
            "total": total_notifs,
            "unread": unread_notifs,
            "recent": [
                {"id": n.id, "message": n.message, "type": n.type, "is_read": n.is_read, "created_at": str(n.created_at)}
                for n in recent_notifs
            ],
        },
        "qa": {"total": total_qa},
        "suggestions": {"total": total_suggestions, "active": active_suggestions},
        "workflows": {"total": total_workflows, "active": active_workflows},
        "productivity_score": productivity_score,
    }
