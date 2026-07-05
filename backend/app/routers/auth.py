from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from .. import models, schemas, auth, database

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register", response_model=schemas.User)
def register(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    print(f"Registering user: {user.email}")
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        print("User already exists")
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = auth.get_password_hash(user.password)
    print(f"Password hashed: {hashed_password[:10]}...")
    new_user = models.User(email=user.email, hashed_password=hashed_password)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    print(f"User created: {new_user.id}")
    return new_user

@router.post("/login", response_model=schemas.Token)
def login(user_credentials: schemas.UserCreate, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == user_credentials.email).first()
    if not user or not auth.verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    
    access_token = auth.create_access_token(data={"sub": user.email})
    return {"access_token": access_token, "token_type": "bearer"}
