from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List, Optional
import json
from .. import models, schemas, database, auth
from ..protocols import mqtt_handler

router = APIRouter()

# WebSocket Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

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
    
    # Notify Protocols
    message = {"event": "new_expense", "expense_id": db_expense.id, "amount": db_expense.amount, "description": db_expense.description, "payer": current_user.username}
    mqtt_handler.publish(message)
    await manager.broadcast(json.dumps(message))

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
    
    message = {"event": "update_expense", "expense_id": db_expense.id}
    mqtt_handler.publish(message)
    await manager.broadcast(json.dumps(message))

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

    message = {"event": "delete_expense", "expense_id": expense_id}
    mqtt_handler.publish(message)
    await manager.broadcast(json.dumps(message))

    return {"detail": "Expense deleted"}

@router.get("/chat/history", response_model=List[schemas.Message])
def get_chat_history(db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    messages = db.query(models.Message).order_by(models.Message.timestamp.asc()).limit(50).all()
    return messages

@router.delete("/messages/{message_id}")
async def delete_message(message_id: int, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    message = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this message")
    
    db.delete(message)
    db.commit()
    
    # Notify via WebSocket and MQTT
    event = {"event": "delete_message", "message_id": message_id}
    mqtt_handler.publish(event)
    await manager.broadcast(json.dumps(event))
    
    return {"detail": "Message deleted"}

@router.put("/messages/{message_id}", response_model=schemas.Message)
async def update_message(message_id: int, message_update: schemas.MessageCreate, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_user)):
    message = db.query(models.Message).filter(models.Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to edit this message")
    
    message.content = message_update.content
    db.commit()
    db.refresh(message)
    
    # Notify via WebSocket and MQTT
    event = {"event": "update_message", "message_id": message_id, "content": message.content, "user": current_user.username}
    mqtt_handler.publish(event)
    await manager.broadcast(json.dumps(event))
    
    return message

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, db: Session = Depends(database.get_db)):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # Parse data to extract user and content
            # Data format expected: JSON dict with user, msg, time, event='chat'
            # We trust the 'user' field from client for display, but for DB we should use authenticated user.
            # However, WS here doesn't have easy auth in this snippet without token query param.
            # For simplicity in this demo, we'll try to find the user by username sent in JSON.
            
            try:
                payload = json.loads(data)
                if payload.get('event') == 'chat':
                    username = payload.get('user')
                    content = payload.get('msg')
                    
                    # Find user and save message to DB
                    user = db.query(models.User).filter(models.User.username == username).first()
                    if user:
                        msg_entry = models.Message(user_id=user.id, content=content)
                        db.add(msg_entry)
                        db.commit()
                        db.refresh(msg_entry)
                        # Publish to MQTT as well
                        mqtt_handler.publish_chat_message(username, content)
                        # Add message ID to payload for delete button
                        payload['message_id'] = msg_entry.id
            except json.JSONDecodeError:
                pass  # Invalid JSON, skip processing
            
            # Broadcast with message_id included
            await manager.broadcast(json.dumps(payload) if isinstance(payload, dict) else data)
    except WebSocketDisconnect:
        manager.disconnect(websocket)
