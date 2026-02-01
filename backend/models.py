from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base
from datetime import datetime

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)

    expenses_paid = relationship("Expense", back_populates="payer")
    debts = relationship("ExpenseShare", back_populates="debtor")

class Expense(Base):
    __tablename__ = "expenses"

    id = Column(Integer, primary_key=True, index=True)
    payer_id = Column(Integer, ForeignKey("users.id"))
    amount = Column(Float)
    description = Column(String)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    payer = relationship("User", foreign_keys=[payer_id])
    shares = relationship("ExpenseShare", back_populates="expense", cascade="all, delete-orphan")

class ExpenseShare(Base):
    __tablename__ = "expense_shares"

    id = Column(Integer, primary_key=True, index=True)
    expense_id = Column(Integer, ForeignKey("expenses.id"))
    debtor_id = Column(Integer, ForeignKey("users.id"))
    amount_owed = Column(Float)

    expense = relationship("Expense", back_populates="shares")
    debtor = relationship("User")

class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    content = Column(String)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
