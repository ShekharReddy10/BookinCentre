from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_accessible_cluster_ids, get_current_user, require_roles
from app.database import get_db
from app.models import Room, User, UserRole, RoomStatus
from app.schemas import RoomCreate, RoomOut, RoomUpdate

router = APIRouter(prefix="/rooms", tags=["rooms"])


def _check_cluster_access(cluster_id: str, current_user: User, db: Session):
    accessible = get_accessible_cluster_ids(current_user, db)
    if accessible is not None and cluster_id not in accessible:
        raise HTTPException(status_code=403, detail="No access to this cluster")


@router.get("", response_model=List[RoomOut])
def list_rooms(
    cluster_id: Optional[str] = None,
    status: Optional[RoomStatus] = None,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    accessible = get_accessible_cluster_ids(current_user, db)
    q = db.query(Room)
    if accessible is not None:
        q = q.filter(Room.cluster_id.in_(accessible))
    if cluster_id is not None:
        q = q.filter(Room.cluster_id == cluster_id)
    if status is not None:
        q = q.filter(Room.status == status)
    if is_active is not None:
        q = q.filter(Room.is_active == is_active)
    return q.order_by(Room.room_number).all()


@router.post("", response_model=RoomOut)
def create_room(
    payload: RoomCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.manager)),
):
    _check_cluster_access(payload.cluster_id, current_user, db)
    if db.query(Room).filter(Room.room_number == payload.room_number).first():
        raise HTTPException(status_code=400, detail="Room number already exists")
    room = Room(**payload.model_dump())
    db.add(room)
    db.commit()
    db.refresh(room)
    return room


@router.get("/{room_id}", response_model=RoomOut)
def get_room(room_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    _check_cluster_access(room.cluster_id, current_user, db)
    return room


@router.patch("/{room_id}", response_model=RoomOut)
def update_room(
    room_id: str,
    payload: RoomUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin, UserRole.manager)),
):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    _check_cluster_access(room.cluster_id, current_user, db)
    if payload.cluster_id:
        _check_cluster_access(payload.cluster_id, current_user, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(room, field, value)
    db.commit()
    db.refresh(room)
    return room


@router.delete("/{room_id}")
def delete_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.admin)),
):
    room = db.query(Room).filter(Room.id == room_id).first()
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    room.is_active = False
    db.commit()
    return {"ok": True}
