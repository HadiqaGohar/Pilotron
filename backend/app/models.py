from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, JSON, Text, Table
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
from .database import Base

# Association table for document-tag many-to-many
document_tags = Table(
    'document_tags',
    Base.metadata,
    Column('document_id', Integer, ForeignKey('documents.id'), primary_key=True),
    Column('tag_id', Integer, ForeignKey('tags.id'), primary_key=True)
)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    tasks = relationship("Task", back_populates="owner")
    notifications = relationship("Notification", back_populates="owner")

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    description = Column(String, nullable=True)
    status = Column(String, default="todo")  # todo, in_progress, done
    priority = Column(String, default="normal")  # high, normal, low
    due_date = Column(DateTime(timezone=True), nullable=True)
    reminder_at = Column(DateTime(timezone=True), nullable=True)  # when to send reminder notification
    reminder_sent = Column(Boolean, default=False)  # has reminder been sent
    recurrence_rule = Column(String, nullable=True)  # daily, weekly, monthly, null
    recurrence_end_date = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    user_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="tasks")
    subtasks = relationship("Subtask", back_populates="task", cascade="all, delete-orphan")

class Subtask(Base):
    __tablename__ = "subtasks"
    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id"))
    title = Column(String)
    is_done = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    task = relationship("Task", back_populates="subtasks")

class ChatSession(Base):
    __tablename__ = "chat_sessions"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    user_id = Column(Integer, ForeignKey("users.id"))
    is_pinned = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    messages = relationship("ChatMessage", back_populates="session")

class ChatMessage(Base):
    __tablename__ = "chat_messages"
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"))
    role = Column(String)
    content = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    session = relationship("ChatSession", back_populates="messages")

class Folder(Base):
    __tablename__ = "folders"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    user_id = Column(Integer, ForeignKey("users.id"))
    color = Column(String, default="#3B82F6")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    documents = relationship("Document", back_populates="folder")

class Tag(Base):
    __tablename__ = "tags"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    user_id = Column(Integer, ForeignKey("users.id"))
    color = Column(String, default="#10B981")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    folder_id = Column(Integer, ForeignKey("folders.id"), nullable=True)
    filename = Column(String)
    file_size = Column(Integer, default=0)
    total_chunks = Column(Integer, default=0)
    status = Column(String, default="ready")
    error_message = Column(String, nullable=True)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    chunks = relationship("DocumentChunk", back_populates="document")
    qa_history = relationship("DocumentQA", back_populates="document")
    folder = relationship("Folder", back_populates="documents")
    tags = relationship("Tag", secondary=document_tags)

class DocumentChunk(Base):
    __tablename__ = "document_chunks"
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    chunk_text = Column(Text)
    chunk_index = Column(Integer)
    page_number = Column(Integer, nullable=True)
    embedding = Column(Vector(384), nullable=True)  # sentence-transformers all-MiniLM-L6-v2 = 384 dims
    document = relationship("Document", back_populates="chunks")

class DocumentQA(Base):
    __tablename__ = "document_qa"
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    question = Column(Text)
    answer = Column(Text)
    sources = Column(JSON, nullable=True)
    is_cross_doc = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    document = relationship("Document", back_populates="qa_history")

class DocumentShare(Base):
    __tablename__ = "document_shares"
    id = Column(Integer, primary_key=True, index=True)
    document_id = Column(Integer, ForeignKey("documents.id"))
    shared_with_id = Column(Integer, ForeignKey("users.id"))
    permission = Column(String, default="view")  # view, edit
    shared_by_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    document = relationship("Document")
    shared_with = relationship("User", foreign_keys=[shared_with_id])
    shared_by = relationship("User", foreign_keys=[shared_by_id])

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    message = Column(String)
    type = Column(String)  # task, document, chat, workflow, system
    priority = Column(String, default="normal")  # urgent, normal, low
    is_read = Column(Boolean, default=False)
    is_archived = Column(Boolean, default=False)
    group_key = Column(String, nullable=True)  # for smart grouping
    related_id = Column(Integer, nullable=True)  # task_id, doc_id, etc.
    related_type = Column(String, nullable=True)  # task, document, chat, workflow
    link = Column(String, nullable=True)  # deep link to related item
    snoozed_until = Column(DateTime(timezone=True), nullable=True)  # snooze remind_at
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    owner = relationship("User", back_populates="notifications")

class NotificationPreference(Base):
    __tablename__ = "notification_preferences"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    notification_type = Column(String)  # task, document, chat, workflow, system
    in_app_enabled = Column(Boolean, default=True)
    email_enabled = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class Suggestion(Base):
    __tablename__ = "suggestions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    source_type = Column(String)  # task, document, chat, pattern
    title = Column(String)
    description = Column(String)
    reason = Column(String, nullable=True)  # why this suggestion
    action_type = Column(String)  # create_task, summarize, create_workflow, open_document
    action_payload = Column(JSON, nullable=True)  # data for the action
    priority = Column(String, default="normal")  # high, normal, low
    is_dismissed = Column(Boolean, default=False)
    feedback = Column(String, nullable=True)  # accepted, rejected, null
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    owner = relationship("User")

class Workflow(Base):
    __tablename__ = "workflows"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    name = Column(String)
    description = Column(String, nullable=True)
    flow_config = Column(JSON)  # React Flow nodes + edges JSON
    trigger_type = Column(String)  # document_uploaded, task_overdue, manual, etc.
    actions = Column(JSON)  # Array of action configs for execution
    is_active = Column(Boolean, default=True)
    last_run_at = Column(DateTime(timezone=True), nullable=True)
    run_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    executions = relationship("WorkflowExecution", back_populates="workflow")

class WorkflowExecution(Base):
    __tablename__ = "workflow_executions"
    id = Column(Integer, primary_key=True, index=True)
    workflow_id = Column(Integer, ForeignKey("workflows.id"))
    triggered_by = Column(String, nullable=True)  # what triggered it
    status = Column(String, default="success")  # success, failed, partial
    error_message = Column(String, nullable=True)
    execution_details = Column(JSON)  # step-by-step results
    dry_run = Column(Boolean, default=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)
    workflow = relationship("Workflow", back_populates="executions")
