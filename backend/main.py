from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from .database import engine, Base
from .routes import users

Base.metadata.create_all(bind=engine)

app = FastAPI()

app.include_router(users.router, tags=["users"])

#app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
