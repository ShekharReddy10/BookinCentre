from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_accessible_cluster_ids, get_current_user, require_roles
from app.database import get_db
from app.ical_sync import sync_feed
from app.models import ICalFeed, Room, User, UserRole
from app.schemas import ICalFeedCreate, ICalFeedOut

router = APIRouter(prefix="/ical-feeds", tags=["ical"])


def _check_access(room: Room, current_user: User, db: Session):
    accessible = get_accessible_cluster_ids(current_user, db)
    if accessible is not None and room.cluster_id not in accessible:
        raise HTTPException(status_code=403, detail="No access to this cluster")


@router.get("", response_model=List[ICalFeedOut])
def list_feeds(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    q = db.query(ICalFeed).join(Room, ICalFeed.room_id == Room.id)
    accessible = get_accessible_cluster_ids(current_user, db)
    if accessible is not None:
        q = q.filter(Room.cluster_id.in_(accessible))
    return q.all()


@router.post("", response_model=ICalFeedOut)
def create_feed(
    payload: ICalFeedCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.manager)),
):
    room = db.query(Room).filter(Room.id == payload.room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    _check_access(room, current_user, db)

    feed = ICalFeed(**payload.model_dump())
    db.add(feed)
    db.commit()
    db.refresh(feed)
    return feed


@router.post("/{feed_id}/sync")
def sync_one_feed(
    feed_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.manager)),
):
    feed = db.query(ICalFeed).filter(ICalFeed.id == feed_id).first()
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")
    _check_access(feed.room, current_user, db)
    try:
        return sync_feed(db, feed)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Failed to sync feed: {e}")


@router.delete("/{feed_id}")
def delete_feed(
    feed_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.manager)),
):
    feed = db.query(ICalFeed).filter(ICalFeed.id == feed_id).first()
    if not feed:
        raise HTTPException(status_code=404, detail="Feed not found")
    _check_access(feed.room, current_user, db)
    db.delete(feed)
    db.commit()
    return {"ok": True}
