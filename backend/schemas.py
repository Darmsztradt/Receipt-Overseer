from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

class UserBase(BaseModel):
    username: str

class UserCreate(UserBase):
    password: str

class User(UserBase):
    id: int
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class ExpenseShareBase(BaseModel):
    debtor_id: int
    amount_owed: float

class ExpenseShare(ExpenseShareBase):
    id: int
    expense_id: int
    debtor: Optional[User] = None

    class Config:
        from_attributes = True

class ExpenseBase(BaseModel):
    amount: float
    description: str
    shares: List[ExpenseShareBase] = []

class ExpenseCreate(ExpenseBase):
    pass

class Expense(BaseModel):
    id: int
    payer_id: int
    amount: float
    description: str
    timestamp: Optional[datetime] = None
    payer: Optional[User] = None
    shares: List[ExpenseShare] = []

    class Config:
        from_attributes = True

class UserPasswordUpdate(BaseModel):
    old_password: str
    new_password: str

class MessageBase(BaseModel):
    content: str

class MessageCreate(MessageBase):
    pass

class Message(MessageBase):
    id: int
    user_id: int
    timestamp: datetime
    user: Optional[User] = None

    class Config:
        from_attributes = True
