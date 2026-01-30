from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from .. import models, schemas, database, auth

router = APIRouter()

@router.post("/users/", response_model=schemas.User)
def create_user(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    hashed_password = auth.get_password_hash(user.password)
    db_user = models.User(username=user.username, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@router.put("/users/me/password", status_code=status.HTTP_200_OK)
def change_password(
    password_update: schemas.UserPasswordUpdate, 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(auth.get_current_user)
):
    if not auth.verify_password(password_update.old_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, 
            detail="Incorrect old password"
        )
    
    current_user.hashed_password = auth.get_password_hash(password_update.new_password)
    db.commit()
    return {"detail": "Password updated successfully"}

@router.get("/users/", response_model=List[schemas.User])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    users = db.query(models.User).offset(skip).limit(limit).all()
    return users

@router.get("/users/{user_id}", response_model=schemas.User)
def read_user(user_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if db_user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return db_user

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this user")
    
    db_user = db.query(models.User).filter(models.User.id == user_id).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    db.delete(db_user)
    db.commit()
    return None
