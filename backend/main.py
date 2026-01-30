from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routes import users, expenses, auth_routes

# Create Database Tables
Base.metadata.create_all(bind=engine)

app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(users.router, tags=["users"])
app.include_router(expenses.router, tags=["expenses"])
app.include_router(auth_routes.router, tags=["auth"])

# Mount Frontend
app.mount("/", StaticFiles(directory="frontend", html=True), name="frontend")
