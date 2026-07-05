from fastapi import FastAPI
from .database import engine, Base, init_pgvector
from .routers import auth, tasks, chat, documents, notifications, workflows, suggestions, dashboard
import asyncio
from contextlib import asynccontextmanager
from .services.reminders import check_reminders

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start reminder background task
    asyncio.create_task(check_reminders())
    yield

# Enable pgvector extension
init_pgvector()

Base.metadata.create_all(bind=engine)

app = FastAPI(lifespan=lifespan)

app.include_router(auth.router)
app.include_router(tasks.router)
app.include_router(chat.router)
app.include_router(documents.router)
app.include_router(notifications.router)
app.include_router(workflows.router)
app.include_router(suggestions.router)
app.include_router(dashboard.router)

@app.get("/api/health")
def health():
    return {"status": "ok"}
