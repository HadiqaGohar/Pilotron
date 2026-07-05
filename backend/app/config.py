import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@db:5432/pilotron")
JWT_SECRET = os.getenv("JWT_SECRET", "supersecret")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))
AI_PROVIDER = os.getenv("AI_PROVIDER", "openai")
AI_API_KEY = os.getenv("AI_API_KEY", "")
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "")
STORAGE_PATH = os.getenv("STORAGE_PATH", "/app/storage")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://project.16.jugaar.ai,http://69.12.72.35:4097").split(",")
