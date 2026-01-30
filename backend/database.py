from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base # kept for backward compat if needed but usually:
# from sqlalchemy.orm import declarative_base 
# However, `sqlalchemy.ext.declarative` is the old location. 
# Better:
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import sessionmaker

SQLALCHEMY_DATABASE_URL = "sqlite:///./expenses.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
