from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas, auth, database
from ..services.suggestion import generate_suggestions

router = APIRouter(prefix="/api/suggestions", tags=["suggestions"])

@router.get("/", response_model=List[schemas.Suggestion])
def get_suggestions(
    include_dismissed: bool = False,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_user)
):
    """List active suggestions."""
    query = db.query(models.Suggestion).filter(models.Suggestion.user_id == current_user.id)
    if not include_dismissed:
        query = query.filter(models.Suggestion.is_dismissed == False)
    return query.order_by(
        models.Suggestion.priority.desc(),
        models.Suggestion.created_at.desc()
    ).all()

@router.post("/generate", response_model=List[schemas.Suggestion])
def generate_new_suggestions(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Manually trigger suggestion generation."""
    return generate_suggestions(db, current_user.id)

@router.post("/{suggestion_id}/apply")
def apply_suggestion(suggestion_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Execute the suggested action."""
    suggestion = db.query(models.Suggestion).filter(
        models.Suggestion.id == suggestion_id,
        models.Suggestion.user_id == current_user.id
    ).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    
    result = {"status": "applied", "action_type": suggestion.action_type}
    
    if suggestion.action_type == "create_task" and suggestion.action_payload:
        new_task = models.Task(
            title=suggestion.action_payload.get("title", "Suggested Task"),
            description=suggestion.action_payload.get("description"),
            status=suggestion.action_payload.get("status", "todo"),
            user_id=current_user.id
        )
        db.add(new_task)
        db.flush()
        result["task_id"] = new_task.id
        result["message"] = f"Task created: {new_task.title}"
    
    elif suggestion.action_type == "open_tasks":
        result["message"] = "Navigate to Tasks page"
        result["redirect"] = "/tasks"
    
    elif suggestion.action_type == "summarize":
        result["message"] = "Navigate to Documents page"
        result["redirect"] = "/documents"
    
    elif suggestion.action_type == "create_workflow":
        result["message"] = "Navigate to Workflows page"
        result["redirect"] = "/workflows"
    
    else:
        result["message"] = f"Action '{suggestion.action_type}' noted"
    
    # Mark as accepted
    suggestion.feedback = "accepted"
    db.commit()
    
    return result

@router.post("/{suggestion_id}/feedback")
def submit_feedback(suggestion_id: int, feedback: schemas.SuggestionFeedback, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Submit thumbs up/down feedback."""
    suggestion = db.query(models.Suggestion).filter(
        models.Suggestion.id == suggestion_id,
        models.Suggestion.user_id == current_user.id
    ).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    
    suggestion.feedback = feedback.feedback
    db.commit()
    return {"status": "feedback recorded"}

@router.post("/{suggestion_id}/dismiss")
def dismiss_suggestion(suggestion_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Dismiss suggestion without feedback."""
    suggestion = db.query(models.Suggestion).filter(
        models.Suggestion.id == suggestion_id,
        models.Suggestion.user_id == current_user.id
    ).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    
    suggestion.is_dismissed = True
    db.commit()
    return {"status": "dismissed"}

@router.delete("/{suggestion_id}")
def delete_suggestion(suggestion_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Permanently delete suggestion."""
    suggestion = db.query(models.Suggestion).filter(
        models.Suggestion.id == suggestion_id,
        models.Suggestion.user_id == current_user.id
    ).first()
    if not suggestion:
        raise HTTPException(status_code=404, detail="Suggestion not found")
    
    db.delete(suggestion)
    db.commit()
    return {"status": "deleted"}

@router.get("/stats")
def get_stats(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Get suggestion statistics."""
    total = db.query(models.Suggestion).filter(models.Suggestion.user_id == current_user.id).count()
    active = db.query(models.Suggestion).filter(
        models.Suggestion.user_id == current_user.id,
        models.Suggestion.is_dismissed == False
    ).count()
    accepted = db.query(models.Suggestion).filter(
        models.Suggestion.user_id == current_user.id,
        models.Suggestion.feedback == "accepted"
    ).count()
    rejected = db.query(models.Suggestion).filter(
        models.Suggestion.user_id == current_user.id,
        models.Suggestion.feedback == "rejected"
    ).count()
    
    return {
        "total": total,
        "active": active,
        "accepted": accepted,
        "rejected": rejected,
        "acceptance_rate": round(accepted / max(accepted + rejected, 1) * 100)
    }
