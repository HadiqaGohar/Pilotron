from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
from datetime import datetime, timedelta
from .. import models, schemas, auth, database

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

# ========== LIST / GET ==========

@router.get("/", response_model=List[schemas.Notification])
def get_notifications(
    filter: Optional[str] = Query("all", regex="^(all|unread|read|archived)$"),
    priority: Optional[str] = None,
    type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """List notifications with filters."""
    query = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.snoozed_until.is_(None) | (models.Notification.snoozed_until < func.now())
    )
    
    if filter == "unread":
        query = query.filter(models.Notification.is_read == False, models.Notification.is_archived == False)
    elif filter == "read":
        query = query.filter(models.Notification.is_read == True, models.Notification.is_archived == False)
    elif filter == "archived":
        query = query.filter(models.Notification.is_archived == True)
    else:  # all
        query = query.filter(models.Notification.is_archived == False)
    
    if priority:
        query = query.filter(models.Notification.priority == priority)
    if type:
        query = query.filter(models.Notification.type == type)
    
    # Sort: urgent first, then by date
    return query.order_by(
        models.Notification.priority.desc(),
        models.Notification.created_at.desc()
    ).limit(limit).offset(offset).all()

@router.get("/count")
def get_unread_count(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Get unread notification count."""
    count = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False,
        models.Notification.is_archived == False,
        models.Notification.snoozed_until.is_(None) | (models.Notification.snoozed_until < func.now())
    ).count()
    return {"unread": count}

# ========== MARK READ ==========

@router.post("/{notification_id}/read", response_model=schemas.Notification)
def mark_as_read(notification_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    notification = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == current_user.id
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_read = True
    db.commit()
    db.refresh(notification)
    return notification

@router.post("/mark-all-read")
def mark_all_read(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Mark all notifications as read."""
    count = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False
    ).update({"is_read": True})
    db.commit()
    return {"marked": count}

# ========== ARCHIVE ==========

@router.post("/{notification_id}/archive", response_model=schemas.Notification)
def archive_notification(notification_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    notification = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == current_user.id
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_archived = True
    db.commit()
    db.refresh(notification)
    return notification

@router.post("/{notification_id}/unarchive", response_model=schemas.Notification)
def unarchive_notification(notification_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    notification = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == current_user.id
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    notification.is_archived = False
    db.commit()
    db.refresh(notification)
    return notification

# ========== SNOOZE ==========

@router.post("/{notification_id}/snooze", response_model=schemas.Notification)
def snooze_notification(notification_id: int, snooze: schemas.NotificationSnooze, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    notification = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == current_user.id
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    if snooze.remind_at:
        notification.snoozed_until = snooze.remind_at
    elif snooze.hours:
        notification.snoozed_until = datetime.utcnow() + timedelta(hours=snooze.hours)
    else:
        notification.snoozed_until = datetime.utcnow() + timedelta(hours=1)  # default 1 hour
    
    db.commit()
    db.refresh(notification)
    return notification

# ========== DELETE ==========

@router.delete("/{notification_id}")
def delete_notification(notification_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    notification = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == current_user.id
    ).first()
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    
    db.delete(notification)
    db.commit()
    return {"message": "Notification deleted"}

# ========== PREFERENCES ==========

@router.get("/preferences", response_model=List[schemas.NotificationPreference])
def get_preferences(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Get user notification preferences."""
    prefs = db.query(models.NotificationPreference).filter(
        models.NotificationPreference.user_id == current_user.id
    ).all()
    
    # If no preferences exist, create defaults
    if not prefs:
        default_types = ["task", "document", "chat", "workflow", "system"]
        for ntype in default_types:
            pref = models.NotificationPreference(
                user_id=current_user.id,
                notification_type=ntype,
                in_app_enabled=True,
                email_enabled=False
            )
            db.add(pref)
        db.commit()
        prefs = db.query(models.NotificationPreference).filter(
            models.NotificationPreference.user_id == current_user.id
        ).all()
    
    return prefs

@router.patch("/preferences/{notification_type}", response_model=schemas.NotificationPreference)
def update_preference(notification_type: str, update: schemas.NotificationPreferenceUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Update notification preference for a type."""
    pref = db.query(models.NotificationPreference).filter(
        models.NotificationPreference.user_id == current_user.id,
        models.NotificationPreference.notification_type == notification_type
    ).first()
    
    if not pref:
        pref = models.NotificationPreference(
            user_id=current_user.id,
            notification_type=notification_type
        )
        db.add(pref)
    
    if update.in_app_enabled is not None:
        pref.in_app_enabled = update.in_app_enabled
    if update.email_enabled is not None:
        pref.email_enabled = update.email_enabled
    
    db.commit()
    db.refresh(pref)
    return pref

# ========== CREATE (Internal use by other modules) ==========

@router.post("/", response_model=schemas.Notification)
def create_notification(notification: schemas.NotificationCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Create a new notification."""
    new_notif = models.Notification(
        user_id=current_user.id,
        message=notification.message,
        type=notification.type,
        priority=notification.priority or "normal",
        related_id=notification.related_id,
        related_type=notification.related_type,
        link=notification.link,
        group_key=notification.group_key
    )
    db.add(new_notif)
    db.commit()
    db.refresh(new_notif)
    return new_notif
