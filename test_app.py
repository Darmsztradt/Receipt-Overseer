import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Setup test environment variables before importing app modules
os.environ["SECRET_KEY"] = "[ENCRYPTION_KEY]"

from backend.main import app
from backend.database import Base, get_db
from backend.models import User, Expense, ExpenseShare, Message

# Setup test database (file-based) to prevent corrupting local SQLite data and maintain connection schema
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_expenses.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Database session override for FastAPI Dependency Injection
def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

@pytest.fixture(autouse=True)
def setup_db():
    # Setup test database tables
    Base.metadata.create_all(bind=engine)
    yield
    # Cleanup database tables
    Base.metadata.drop_all(bind=engine)
    # Remove test DB file
    if os.path.exists("./test_expenses.db"):
        try:
            os.remove("./test_expenses.db")
        except Exception:
            pass

client = TestClient(app)

def test_register_duplicate_user():
    # Register user1
    resp = client.post("/users/", json={"username": "user1", "password": "password1"})
    assert resp.status_code == 200
    
    # Try to register user1 again (should raise 400 Bad Request)
    resp = client.post("/users/", json={"username": "user1", "password": "password1"})
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Username already registered"

def test_login_incorrect_credentials():
    # Register user1
    client.post("/users/", json={"username": "user1", "password": "password1"})
    
    # Attempt login with wrong password
    resp = client.post("/token", data={"username": "user1", "password": "wrongpassword"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Incorrect username or password"

def test_unauthorized_endpoints():
    # Fetch expenses without authentication headers
    resp = client.get("/expenses/")
    assert resp.status_code == 401
    assert resp.json()["detail"] == "Could not validate credentials"

def test_delete_other_user_expense_forbidden():
    # Register User A and User B
    client.post("/users/", json={"username": "usera", "password": "passworda"})
    client.post("/users/", json={"username": "userb", "password": "passwordb"})
    
    # Login User A
    login_a = client.post("/token", data={"username": "usera", "password": "passworda"})
    token_a = login_a.json()["access_token"]
    
    # Login User B
    login_b = client.post("/token", data={"username": "userb", "password": "passwordb"})
    token_b = login_b.json()["access_token"]
    
    # User A creates an expense splitting with User B (debtor_id = 2)
    headers_a = {"Authorization": f"Bearer {token_a}"}
    expense_data = {
        "amount": 120.00,
        "description": "Pizza Party",
        "shares": [{"debtor_id": 2, "amount_owed": 60.00}]
    }
    create_resp = client.post("/expenses/", json=expense_data, headers=headers_a)
    assert create_resp.status_code == 200
    expense_id = create_resp.json()["id"]
    
    # User B tries to delete User A's expense (should return 403 Forbidden)
    headers_b = {"Authorization": f"Bearer {token_b}"}
    del_resp = client.delete(f"/expenses/{expense_id}", headers=headers_b)
    assert del_resp.status_code == 403
    assert del_resp.json()["detail"] == "Not authorized to delete this expense"
    
    # User A deletes their own expense successfully (returns 200 OK)
    del_resp = client.delete(f"/expenses/{expense_id}", headers=headers_a)
    assert del_resp.status_code == 200

def test_delete_non_existent_expense():
    # Login User A
    client.post("/users/", json={"username": "usera", "password": "passworda"})
    login_a = client.post("/token", data={"username": "usera", "password": "passworda"})
    token_a = login_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}
    
    # Try deleting a random high-valued expense ID
    resp = client.delete("/expenses/9999", headers=headers_a)
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Expense not found"

def test_expense_division_precision():
    # Register 3 users
    client.post("/users/", json={"username": "usera", "password": "passworda"})
    client.post("/users/", json={"username": "userb", "password": "passwordb"})
    client.post("/users/", json={"username": "userc", "password": "passwordc"})
    
    # Login User A
    login_a = client.post("/token", data={"username": "usera", "password": "passworda"})
    token_a = login_a.json()["access_token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}
    
    # Create an expense of 100.00 PLN split among all three (33.33 PLN to debtor B and C)
    expense_data = {
        "amount": 100.00,
        "description": "Shared ride",
        "shares": [
            {"debtor_id": 2, "amount_owed": 33.33},
            {"debtor_id": 3, "amount_owed": 33.33}
        ]
    }
    resp = client.post("/expenses/", json=expense_data, headers=headers_a)
    assert resp.status_code == 200
    shares = resp.json()["shares"]
    assert len(shares) == 2
    assert shares[0]["amount_owed"] == 33.33
    assert shares[1]["amount_owed"] == 33.33
