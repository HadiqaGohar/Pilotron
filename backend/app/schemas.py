from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional, List, Any

class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    status: Optional[str] = "todo"
    priority: Optional[str] = "normal"
    due_date: Optional[datetime] = None
    reminder_at: Optional[datetime] = None
    recurrence_rule: Optional[str] = None
    recurrence_end_date: Optional[datetime] = None

class TaskCreate(TaskBase):
    pass

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None
    reminder_at: Optional[datetime] = None
    recurrence_rule: Optional[str] = None
    recurrence_end_date: Optional[datetime] = None

class SubtaskBase(BaseModel):
    title: str

class SubtaskCreate(SubtaskBase):
    pass

class Subtask(SubtaskBase):
    id: int
    task_id: int
    is_done: bool = False
    created_at: datetime
    class Config:
        from_attributes = True

class Task(TaskBase):
    id: int
    user_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    subtasks: List[Subtask] = []
    class Config:
        from_attributes = True

class ChatMessageBase(BaseModel):
    role: str
    content: str

class ChatMessageCreate(ChatMessageBase):
    pass

class ChatMessage(ChatMessageBase):
    id: int
    session_id: int
    created_at: datetime
    class Config:
        from_attributes = True

class ChatSessionBase(BaseModel):
    title: str

class ChatSessionCreate(ChatSessionBase):
    pass

class ChatSession(ChatSessionBase):
    id: int
    user_id: int
    is_pinned: bool = False
    created_at: datetime
    messages: List[ChatMessage] = []
    class Config:
        from_attributes = True

class ChatSessionUpdate(BaseModel):
    title: Optional[str] = None
    is_pinned: Optional[bool] = None

class MessageEdit(BaseModel):
    content: str

class DocumentBase(BaseModel):
    filename: str

class DocumentCreate(DocumentBase):
    pass

class Document(DocumentBase):
    id: int
    user_id: int
    file_size: int = 0
    total_chunks: int = 0
    status: str = "ready"
    error_message: Optional[str] = None
    uploaded_at: datetime
    class Config:
        from_attributes = True

class DocumentDetail(BaseModel):
    id: int
    filename: str
    uploaded_at: str
    file_size: int
    total_chunks: int
    status: str
    error_message: Optional[str] = None
    content: str = ""
    pages: List[dict] = []

class DocumentQuery(BaseModel):
    query: str

class DocumentQABase(BaseModel):
    question: str
    answer: str
    sources: Optional[Any] = None
    document_id: Optional[int] = None
    is_cross_doc: bool = False

class DocumentQA(DocumentQABase):
    id: int
    user_id: int
    created_at: datetime
    class Config:
        from_attributes = True

class NotificationBase(BaseModel):
    message: str
    type: str
    priority: Optional[str] = "normal"
    related_id: Optional[int] = None
    related_type: Optional[str] = None
    link: Optional[str] = None
    group_key: Optional[str] = None

class NotificationCreate(NotificationBase):
    pass

class Notification(NotificationBase):
    id: int
    user_id: int
    is_read: bool = False
    is_archived: bool = False
    snoozed_until: Optional[datetime] = None
    created_at: datetime
    class Config:
        from_attributes = True

class NotificationSnooze(BaseModel):
    hours: Optional[int] = None
    remind_at: Optional[datetime] = None

class NotificationPreferenceBase(BaseModel):
    notification_type: str
    in_app_enabled: bool = True
    email_enabled: bool = False

class NotificationPreference(NotificationPreferenceBase):
    id: int
    user_id: int
    class Config:
        from_attributes = True

class NotificationPreferenceUpdate(BaseModel):
    in_app_enabled: Optional[bool] = None
    email_enabled: Optional[bool] = None

class SuggestionBase(BaseModel):
    source_type: str
    title: str
    description: str
    reason: Optional[str] = None
    action_type: str
    action_payload: Optional[dict] = None
    priority: Optional[str] = "normal"

class SuggestionCreate(SuggestionBase):
    pass

class Suggestion(SuggestionBase):
    id: int
    user_id: int
    is_dismissed: bool = False
    feedback: Optional[str] = None
    created_at: datetime
    class Config:
        from_attributes = True

class SuggestionFeedback(BaseModel):
    feedback: str  # accepted, rejected

class WorkflowBase(BaseModel):
    name: str
    description: Optional[str] = None
    trigger_type: str
    actions: Optional[List[dict]] = []

class WorkflowCreate(WorkflowBase):
    flow_config: Optional[dict] = None

class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    flow_config: Optional[dict] = None
    trigger_type: Optional[str] = None
    actions: Optional[List[dict]] = None
    is_active: Optional[bool] = None

class Workflow(WorkflowBase):
    id: int
    user_id: int
    flow_config: Optional[dict] = None
    is_active: bool
    last_run_at: Optional[datetime] = None
    run_count: int = 0
    created_at: datetime
    updated_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class WorkflowExecutionBase(BaseModel):
    triggered_by: Optional[str] = None
    status: str = "success"
    error_message: Optional[str] = None
    execution_details: Optional[dict] = None
    dry_run: bool = False

class WorkflowExecution(WorkflowExecutionBase):
    id: int
    workflow_id: int
    started_at: datetime
    completed_at: Optional[datetime] = None
    class Config:
        from_attributes = True

class WorkflowTestRequest(BaseModel):
    dry_run: bool = True
    test_data: Optional[dict] = None
