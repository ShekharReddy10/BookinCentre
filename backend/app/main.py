from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.routers import (
    auth, users, rooms, bookings, clusters, dashboard, expenses, guests, reports,
    automation, ical_feeds,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Booking Control Center API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(clusters.router)
app.include_router(rooms.router)
app.include_router(bookings.router)
app.include_router(dashboard.router)
app.include_router(expenses.router)
app.include_router(guests.router)
app.include_router(reports.router)
app.include_router(automation.router)
app.include_router(ical_feeds.router)


@app.get("/health")
def health():
    return {"status": "ok"}
