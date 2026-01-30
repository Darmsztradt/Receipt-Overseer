from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from .. import models, schemas, database, auth
import json

router = APIRouter()



@router.post("/expenses/", response_model=schemas.Expense)
async def create_expense(expense: schemas.ExpenseCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    # Create Expense
    db_expense = models.Expense(
        payer_id=current_user.id,
        amount=expense.amount,
        description=expense.description
    )
    db.add(db_expense)
    db.commit()
    db.refresh(db_expense)

    # Process Shares (Debt)
    for share_data in expense.shares:
        db_share = models.ExpenseShare(
            expense_id=db_expense.id,
            debtor_id=share_data.debtor_id,
            amount_owed=share_data.amount_owed
        )
        db.add(db_share)
    
    db.commit()
    db.refresh(db_expense)
    


    return db_expense

@router.get("/expenses/", response_model=List[schemas.Expense])
def read_expenses(
    skip: int = 0, 
    limit: int = 100, 
    search: Optional[str] = None, 
    db: Session = Depends(database.get_db), 
    current_user: models.User = Depends(auth.get_current_user)
):
    query = db.query(models.Expense)
    if search:
        # Pattern matching (LIKE %search%)
        query = query.filter(models.Expense.description.contains(search))
    
    expenses = query.offset(skip).limit(limit).all()
    return expenses

@router.put("/expenses/{expense_id}", response_model=schemas.Expense)
async def update_expense(expense_id: int, expense_update: schemas.ExpenseCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not db_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    # Basic authorization check: Only payer can edit? Or anyone? Let's say payer.
    if db_expense.payer_id != current_user.id:
         raise HTTPException(status_code=403, detail="Not authorized to edit this expense")

    db_expense.amount = expense_update.amount
    db_expense.description = expense_update.description
    
    # Simple logic: remove old shares and add new ones (not efficient but simple)
    db.query(models.ExpenseShare).filter(models.ExpenseShare.expense_id == expense_id).delete()
    
    for share_data in expense_update.shares:
        db_share = models.ExpenseShare(
            expense_id=db_expense.id,
            debtor_id=share_data.debtor_id,
            amount_owed=share_data.amount_owed
        )
        db.add(db_share)

    db.commit()
    db.refresh(db_expense)
    


    return db_expense

@router.delete("/expenses/{expense_id}")
async def delete_expense(expense_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    db_expense = db.query(models.Expense).filter(models.Expense.id == expense_id).first()
    if not db_expense:
        raise HTTPException(status_code=404, detail="Expense not found")
        
    if db_expense.payer_id != current_user.id:
         raise HTTPException(status_code=403, detail="Not authorized to delete this expense")

    db.delete(db_expense)
    db.commit()



    return {"detail": "Expense deleted"}


