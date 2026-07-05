from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from .. import models

def generate_task_suggestions(db: Session, user_id: int) -> list:
    """Generate suggestions based on user's tasks."""
    suggestions = []
    
    # Get user's tasks
    tasks = db.query(models.Task).filter(models.Task.user_id == user_id).all()
    
    # 1. Overdue tasks
    now_utc = datetime.now(timezone.utc)
    overdue_tasks = [t for t in tasks if t.due_date and t.due_date.replace(tzinfo=timezone.utc) < now_utc and t.status != "done"]
    if overdue_tasks:
        task_names = ", ".join([f'"{t.title}"' for t in overdue_tasks[:3]])
        count = len(overdue_tasks)
        suggestions.append({
            "source_type": "task",
            "title": f"{count} overdue task{'s' if count > 1 else ''}",
            "description": f"You have {count} task{'s' if count > 1 else ''} past their deadline: {task_names}",
            "reason": f"Task deadline passed {'days' if count > 1 else 'day'} ago. Overdue tasks may affect your productivity score.",
            "action_type": "create_task",
            "action_payload": {
                "title": f"Follow up: {overdue_tasks[0].title}",
                "description": f"Overdue task follow-up. Original due: {overdue_tasks[0].due_date.strftime('%Y-%m-%d')}",
                "status": "todo"
            },
            "priority": "high"
        })
    
# 2. Tasks due today
    today = now_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today + timedelta(days=1)
    due_today = [t for t in tasks if t.due_date and today <= t.due_date.replace(tzinfo=timezone.utc) < tomorrow and t.status == "todo"]
    if due_today:
        task_names = ", ".join([f'"{t.title}"' for t in due_today[:3]])
        suggestions.append({
            "source_type": "task",
            "title": f"{len(due_today)} task{'s' if len(due_today) > 1 else ''} due today",
            "description": f"Tasks due today: {task_names}",
            "reason": "These tasks are due today. Starting them now helps meet deadlines.",
            "action_type": "open_tasks",
            "action_payload": {"filter": "due_today"},
            "priority": "normal"
        })
    
    # 3. Tasks in todo (stale tasks - older than 7 days without progress)
    stale_threshold = now_utc - timedelta(days=7)
    stale_tasks = [t for t in tasks if t.status == "todo" and t.created_at and t.created_at.replace(tzinfo=timezone.utc) < stale_threshold]
    if stale_tasks and len(stale_tasks) >= 2:
        suggestions.append({
            "source_type": "pattern",
            "title": f"{len(stale_tasks)} tasks haven't been started",
            "description": f"You have {len(stale_tasks)} tasks in 'To Do' for over a week. Consider prioritizing or deferring them.",
            "reason": "Tasks sitting in 'To Do' for over 7 days may need attention or re-prioritization.",
            "action_type": "open_tasks",
            "action_payload": {"filter": "stale"},
            "priority": "normal"
        })
    
    # 4. Many tasks in progress (possible overload)
    in_progress = [t for t in tasks if t.status == "in_progress"]
    if len(in_progress) >= 4:
        suggestions.append({
            "source_type": "pattern",
            "title": "Too many tasks in progress",
            "description": f"You have {len(in_progress)} tasks in progress. Consider completing some before starting new ones.",
            "reason": f"Having {len(in_progress)} concurrent tasks may reduce focus and productivity.",
            "action_type": "open_tasks",
            "action_payload": {"filter": "in_progress"},
            "priority": "normal"
        })
    
    # 5. No tasks at all
    if len(tasks) == 0:
        suggestions.append({
            "source_type": "task",
            "title": "Create your first task",
            "description": "You don't have any tasks yet. Creating tasks helps you stay organized.",
            "reason": "Tasks help track your work and enable AI-powered suggestions.",
            "action_type": "create_task",
            "action_payload": {"title": "My first task", "status": "todo"},
            "priority": "low"
        })
    
    return suggestions

def generate_suggestions(db: Session, user_id: int) -> list:
    """Generate all suggestions for a user."""
    # Get existing active suggestions
    existing = db.query(models.Suggestion).filter(
        models.Suggestion.user_id == user_id,
        models.Suggestion.is_dismissed == False,
        models.Suggestion.feedback == None
    ).all()
    
    # If user already has enough suggestions, don't generate more
    if len(existing) >= 5:
        return existing
    
    # Generate new suggestions
    new_suggestions = generate_task_suggestions(db, user_id)
    
    # Save to database
    saved = []
    for s in new_suggestions:
        # Check if similar suggestion already exists
        similar = db.query(models.Suggestion).filter(
            models.Suggestion.user_id == user_id,
            models.Suggestion.title == s["title"],
            models.Suggestion.is_dismissed == False
        ).first()
        
        if not similar:
            suggestion = models.Suggestion(
                user_id=user_id,
                **s
            )
            db.add(suggestion)
            saved.append(suggestion)
    
    if saved:
        db.commit()
        for s in saved:
            db.refresh(s)
    
    # Return all active suggestions
    return db.query(models.Suggestion).filter(
        models.Suggestion.user_id == user_id,
        models.Suggestion.is_dismissed == False
    ).order_by(
        models.Suggestion.priority.desc(),
        models.Suggestion.created_at.desc()
    ).all()
