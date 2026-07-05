from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from .. import models, schemas, auth, database
import json
import httpx

router = APIRouter(prefix="/api/workflows", tags=["workflows"])

# ========== PRE-BUILT TEMPLATES ==========
TEMPLATES = [
    {
        "id": "doc_notification",
        "name": "Document Upload Notification",
        "description": "Notify when a new document is uploaded",
        "category": "Notifications",
        "trigger_type": "document_uploaded",
        "flow_config": {
            "nodes": [
                {"id": "trigger-1", "type": "trigger", "position": {"x": 250, "y": 50}, "data": {"label": "Document Uploaded", "triggerType": "document_uploaded"}},
                {"id": "action-1", "type": "action", "position": {"x": 250, "y": 200}, "data": {"label": "Send Notification", "actionType": "notify", "config": {"message": "New document uploaded: {{doc_name}}"}}}
            ],
            "edges": [{"id": "e1", "source": "trigger-1", "target": "action-1"}]
        },
        "actions": [
            {"type": "notify", "config": {"message": "New document uploaded: {{doc_name}}"}}
        ]
    },
    {
        "id": "task_reminder",
        "name": "Overdue Task Reminder",
        "description": "Send reminder when task is overdue",
        "category": "Task Management",
        "trigger_type": "task_overdue",
        "flow_config": {
            "nodes": [
                {"id": "trigger-1", "type": "trigger", "position": {"x": 250, "y": 50}, "data": {"label": "Task Overdue", "triggerType": "task_overdue"}},
                {"id": "action-1", "type": "action", "position": {"x": 250, "y": 200}, "data": {"label": "Send Reminder", "actionType": "notify", "config": {"message": "Task '{{task_title}}' is overdue!"}}}
            ],
            "edges": [{"id": "e1", "source": "trigger-1", "target": "action-1"}]
        },
        "actions": [
            {"type": "notify", "config": {"message": "Task '{{task_title}}' is overdue!"}}
        ]
    },
    {
        "id": "urgent_task",
        "name": "Urgent Chat → Create Task",
        "description": "Auto-create task when chat mentions urgent",
        "category": "Task Management",
        "trigger_type": "chat_message",
        "flow_config": {
            "nodes": [
                {"id": "trigger-1", "type": "trigger", "position": {"x": 250, "y": 50}, "data": {"label": "Chat: 'urgent'", "triggerType": "chat_message", "config": {"keyword": "urgent"}}},
                {"id": "action-1", "type": "action", "position": {"x": 250, "y": 200}, "data": {"label": "Create Task", "actionType": "create_task", "config": {"title": "Urgent: {{chat_content}}", "priority": "high"}}}
            ],
            "edges": [{"id": "e1", "source": "trigger-1", "target": "action-1"}]
        },
        "actions": [
            {"type": "create_task", "config": {"title": "Urgent: {{chat_content}}", "priority": "high"}}
        ]
    },
    {
        "id": "doc_backup",
        "name": "Document → Create Review Task",
        "description": "Create review task when document is uploaded",
        "category": "Document Processing",
        "trigger_type": "document_uploaded",
        "flow_config": {
            "nodes": [
                {"id": "trigger-1", "type": "trigger", "position": {"x": 250, "y": 50}, "data": {"label": "Document Uploaded", "triggerType": "document_uploaded"}},
                {"id": "action-1", "type": "action", "position": {"x": 250, "y": 200}, "data": {"label": "Create Review Task", "actionType": "create_task", "config": {"title": "Review: {{doc_name}}", "status": "todo"}}}
            ],
            "edges": [{"id": "e1", "source": "trigger-1", "target": "action-1"}]
        },
        "actions": [
            {"type": "create_task", "config": {"title": "Review: {{doc_name}}", "status": "todo"}}
        ]
    }
]

# ========== TEMPLATES ==========

@router.get("/templates")
def list_templates():
    return TEMPLATES

# ========== CRUD ==========

@router.get("", response_model=List[schemas.Workflow])
def list_workflows(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    return db.query(models.Workflow).filter(
        models.Workflow.user_id == current_user.id
    ).order_by(models.Workflow.created_at.desc()).all()

@router.post("", response_model=schemas.Workflow)
def create_workflow(workflow: schemas.WorkflowCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    new_wf = models.Workflow(
        user_id=current_user.id,
        name=workflow.name,
        description=workflow.description,
        trigger_type=workflow.trigger_type,
        flow_config=workflow.flow_config,
        actions=workflow.actions or []
    )
    db.add(new_wf)
    db.commit()
    db.refresh(new_wf)
    return new_wf

@router.get("/{workflow_id}", response_model=schemas.Workflow)
def get_workflow(workflow_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    wf = db.query(models.Workflow).filter(
        models.Workflow.id == workflow_id,
        models.Workflow.user_id == current_user.id
    ).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf

@router.patch("/{workflow_id}", response_model=schemas.Workflow)
def update_workflow(workflow_id: int, update: schemas.WorkflowUpdate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    wf = db.query(models.Workflow).filter(
        models.Workflow.id == workflow_id,
        models.Workflow.user_id == current_user.id
    ).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    for field, value in update.model_dump(exclude_unset=True).items():
        setattr(wf, field, value)
    
    db.commit()
    db.refresh(wf)
    return wf

@router.delete("/{workflow_id}")
def delete_workflow(workflow_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    wf = db.query(models.Workflow).filter(
        models.Workflow.id == workflow_id,
        models.Workflow.user_id == current_user.id
    ).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    db.query(models.WorkflowExecution).filter(models.WorkflowExecution.workflow_id == workflow_id).delete()
    db.delete(wf)
    db.commit()
    return {"message": "Workflow deleted"}

@router.post("/{workflow_id}/toggle", response_model=schemas.Workflow)
def toggle_workflow(workflow_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    wf = db.query(models.Workflow).filter(
        models.Workflow.id == workflow_id,
        models.Workflow.user_id == current_user.id
    ).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    wf.is_active = not wf.is_active
    db.commit()
    db.refresh(wf)
    return wf

# ========== EXECUTION ENGINE ==========

def execute_action(action: dict, context: dict, dry_run: bool = False) -> dict:
    """Execute a single workflow action."""
    action_type = action.get("type")
    config = action.get("config", {})
    
    # Replace template variables in config
    resolved_config = {}
    for key, value in config.items():
        if isinstance(value, str):
            for k, v in context.items():
                value = value.replace(f"{{{{{k}}}}}", str(v))
        resolved_config[key] = value
    
    if dry_run:
        return {
            "action": action_type,
            "status": "simulated",
            "config": resolved_config,
            "message": f"Would execute: {action_type}"
        }
    
    # Actually execute based on type
    if action_type == "notify":
        # Create notification in DB (we'll pass db through context)
        db = context.get("db")
        user_id = context.get("user_id")
        if db and user_id:
            notif = models.Notification(
                user_id=user_id,
                message=resolved_config.get("message", "Workflow notification"),
                type="workflow"
            )
            db.add(notif)
            db.flush()
        return {"action": "notify", "status": "success", "message": resolved_config.get("message")}
    
    elif action_type == "create_task":
        db = context.get("db")
        user_id = context.get("user_id")
        if db and user_id:
            task = models.Task(
                title=resolved_config.get("title", "Workflow Task"),
                status=resolved_config.get("status", "todo"),
                user_id=user_id
            )
            db.add(task)
            db.flush()
        return {"action": "create_task", "status": "success", "title": resolved_config.get("title")}
    
    elif action_type == "webhook":
        url = resolved_config.get("url")
        method = resolved_config.get("method", "POST")
        if url:
            try:
                with httpx.Client(timeout=10) as client:
                    resp = client.request(method, url, json=resolved_config.get("payload", {}))
                    return {"action": "webhook", "status": "success", "status_code": resp.status_code}
            except Exception as e:
                return {"action": "webhook", "status": "failed", "error": str(e)}
    
    return {"action": action_type, "status": "unknown_action"}

@router.post("/{workflow_id}/test")
def test_workflow(workflow_id: int, req: schemas.WorkflowTestRequest, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Dry-run / test a workflow."""
    wf = db.query(models.Workflow).filter(
        models.Workflow.id == workflow_id,
        models.Workflow.user_id == current_user.id
    ).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    context = {
        "user_id": current_user.id,
        "db": db,
        "doc_name": "test_document.pdf",
        "task_title": "Test Task",
        "chat_content": "test message",
        **(req.test_data or {})
    }
    
    results = []
    for action in (wf.actions or []):
        result = execute_action(action, context, dry_run=req.dry_run)
        results.append(result)
        if result.get("status") == "failed":
            break
    
    # Log execution
    execution = models.WorkflowExecution(
        workflow_id=workflow_id,
        triggered_by="test",
        status="success" if all(r.get("status") != "failed" for r in results) else "failed",
        execution_details={"steps": results},
        dry_run=req.dry_run
    )
    db.add(execution)
    
    if not req.dry_run:
        wf.last_run_at = datetime.utcnow()
        wf.run_count += 1
    
    db.commit()
    db.refresh(execution)
    
    return {
        "execution_id": execution.id,
        "status": execution.status,
        "dry_run": req.dry_run,
        "steps": results
    }

@router.post("/{workflow_id}/trigger")
def trigger_workflow(workflow_id: int, trigger_data: Optional[dict] = None, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    """Actually trigger/execute a workflow."""
    wf = db.query(models.Workflow).filter(
        models.Workflow.id == workflow_id,
        models.Workflow.user_id == current_user.id
    ).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if not wf.is_active:
        raise HTTPException(status_code=400, detail="Workflow is paused")
    
    context = {
        "user_id": current_user.id,
        "db": db,
        **(trigger_data or {})
    }
    
    results = []
    for action in (wf.actions or []):
        result = execute_action(action, context, dry_run=False)
        results.append(result)
        if result.get("status") == "failed":
            break
    
    execution = models.WorkflowExecution(
        workflow_id=workflow_id,
        triggered_by="manual",
        status="success" if all(r.get("status") != "failed" for r in results) else "failed",
        execution_details={"steps": results},
        dry_run=False
    )
    db.add(execution)
    wf.last_run_at = datetime.utcnow()
    wf.run_count += 1
    db.commit()
    db.refresh(execution)
    
    return {"execution_id": execution.id, "status": execution.status, "steps": results}

# ========== EXECUTION HISTORY ==========

@router.get("/{workflow_id}/executions", response_model=List[schemas.WorkflowExecution])
def list_executions(workflow_id: int, limit: int = 20, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    wf = db.query(models.Workflow).filter(
        models.Workflow.id == workflow_id,
        models.Workflow.user_id == current_user.id
    ).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    return db.query(models.WorkflowExecution).filter(
        models.WorkflowExecution.workflow_id == workflow_id
    ).order_by(models.WorkflowExecution.started_at.desc()).limit(limit).all()

# ========== INCOMING WEBHOOK ==========

@router.post("/webhook/{workflow_id}")
def incoming_webhook(workflow_id: int, payload: dict = None, db: Session = Depends(database.get_db)):
    """External webhook trigger - no auth required."""
    wf = db.query(models.Workflow).filter(
        models.Workflow.id == workflow_id,
        models.Workflow.is_active == True
    ).first()
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found or inactive")
    
    context = {
        "webhook_payload": payload or {},
        "db": db,
        "user_id": wf.user_id
    }
    
    results = []
    for action in (wf.actions or []):
        result = execute_action(action, context, dry_run=False)
        results.append(result)
    
    execution = models.WorkflowExecution(
        workflow_id=workflow_id,
        triggered_by="webhook",
        status="success" if all(r.get("status") != "failed" for r in results) else "failed",
        execution_details={"steps": results, "payload": payload}
    )
    db.add(execution)
    wf.last_run_at = datetime.utcnow()
    wf.run_count += 1
    db.commit()
    
    return {"status": "ok", "execution_id": execution.id}
