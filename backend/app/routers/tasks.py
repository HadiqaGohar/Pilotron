from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from .. import models, schemas, auth, database

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

# ========== CRUD ==========

@router.post("", response_model=schemas.Task)
def create_task(task: schemas.TaskCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    new_task = models.Task(**task.model_dump(), user_id=current_user.id)
    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return new_task

@router.get("", response_model=List[schemas.Task])
def get_tasks(
    status: Optional[str] = None,
    priority: Optional[str] = None,
    search: Optional[str] = None,
    sort_by: Optional[str] = "created_at",
    sort_order: Optional[str] = "desc",
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """List tasks with filters."""
    query = db.query(models.Task).filter(models.Task.user_id == current_user.id)
    
    if status:
        query = query.filter(models.Task.status == status)
    if priority:
        query = query.filter(models.Task.priority == priority)
    if search:
        query = query.filter(models.Task.title.ilike(f"%{search}%"))
    
    # Sort
    sort_col = getattr(models.Task, sort_by, models.Task.created_at)
    if sort_order == "asc":
        query = query.order_by(sort_col.asc())
    else:
        query = query.order_by(sort_col.desc())
    
    return query.all()

@router.get("/analytics")
def get_analytics(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Get task analytics."""
    tasks = db.query(models.Task).filter(models.Task.user_id == current_user.id).all()
    
    total = len(tasks)
    todo = len([t for t in tasks if t.status == "todo"])
    in_progress = len([t for t in tasks if t.status == "in_progress"])
    done = len([t for t in tasks if t.status == "done"])
    overdue = len([t for t in tasks if t.due_date and t.due_date < datetime.now(timezone.utc) and t.status != "done"])
    completion_rate = round((done / total * 100) if total > 0 else 0, 1)
    
    # Weekly trend (last 4 weeks)
    weekly_trend = []
    now_utc = datetime.now(timezone.utc)
    for i in range(4):
        week_start = now_utc - timedelta(days=(3 - i) * 7 + now_utc.weekday())
        week_end = week_start + timedelta(days=7)
        week_completed = len([t for t in tasks if t.status == "done" and t.updated_at and week_start <= t.updated_at < week_end])
        weekly_trend.append({
            "week": week_start.strftime("%b %d"),
            "completed": week_completed
        })
    
    # Priority breakdown
    high = len([t for t in tasks if t.priority == "high" and t.status != "done"])
    normal = len([t for t in tasks if t.priority == "normal" and t.status != "done"])
    low = len([t for t in tasks if t.priority == "low" and t.status != "done"])
    
    return {
        "total": total,
        "todo": todo,
        "in_progress": in_progress,
        "done": done,
        "overdue": overdue,
        "completion_rate": completion_rate,
        "weekly_trend": weekly_trend,
        "priority_breakdown": {"high": high, "normal": normal, "low": low}
    }

@router.get("/{task_id}", response_model=schemas.Task)
def get_task(task_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    task = db.query(models.Task).filter(
        models.Task.id == task_id,
        models.Task.user_id == current_user.id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task

@router.patch("/{task_id}", response_model=schemas.Task)
def update_task(task_id: int, update: schemas.TaskUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    task = db.query(models.Task).filter(
        models.Task.id == task_id,
        models.Task.user_id == current_user.id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    
    db.commit()
    db.refresh(task)
    return task

@router.delete("/{task_id}")
def delete_task(task_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    task = db.query(models.Task).filter(
        models.Task.id == task_id,
        models.Task.user_id == current_user.id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    db.delete(task)
    db.commit()
    return {"message": "Task deleted"}

# ========== SUBTASKS ==========

@router.post("/{task_id}/subtasks", response_model=schemas.Subtask)
def create_subtask(task_id: int, subtask: schemas.SubtaskCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    task = db.query(models.Task).filter(
        models.Task.id == task_id,
        models.Task.user_id == current_user.id
    ).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    new_sub = models.Subtask(task_id=task_id, **subtask.model_dump())
    db.add(new_sub)
    db.commit()
    db.refresh(new_sub)
    return new_sub

@router.patch("/subtasks/{subtask_id}", response_model=schemas.Subtask)
def update_subtask(subtask_id: int, update: dict, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    subtask = db.query(models.Subtask).join(models.Task).filter(
        models.Subtask.id == subtask_id,
        models.Task.user_id == current_user.id
    ).first()
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    if "is_done" in update:
        subtask.is_done = update["is_done"]
    if "title" in update:
        subtask.title = update["title"]
    
    db.commit()
    db.refresh(subtask)
    return subtask

@router.delete("/subtasks/{subtask_id}")
def delete_subtask(subtask_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    subtask = db.query(models.Subtask).join(models.Task).filter(
        models.Subtask.id == subtask_id,
        models.Task.user_id == current_user.id
    ).first()
    if not subtask:
        raise HTTPException(status_code=404, detail="Subtask not found")
    
    db.delete(subtask)
    db.commit()
    return {"message": "Subtask deleted"}
