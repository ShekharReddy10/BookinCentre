from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import generate_temp_password, get_current_user, hash_password, require_roles
from app.database import get_db
from app.models import User, UserClusterAccess, UserRole
from app.schemas import (
    AdminUserCreate, SetUserClustersRequest, UserCreatedOut, UserOut, UserUpdate, UserWithClusters,
)

router = APIRouter(prefix="/users", tags=["users"])


def _with_clusters(user: User, db: Session) -> UserWithClusters:
    cluster_ids = [r[0] for r in db.query(UserClusterAccess.cluster_id).filter(UserClusterAccess.user_id == user.id).all()]
    return UserWithClusters(**UserOut.model_validate(user).model_dump(), cluster_ids=cluster_ids)


@router.get("", response_model=List[UserWithClusters])
def list_users(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    users = db.query(User).order_by(User.name).all()
    return [_with_clusters(u, db) for u in users]


@router.post("", response_model=UserCreatedOut)
def create_user(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    temp_password = generate_temp_password()
    user = User(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        role=payload.role,
        hashed_password=hash_password(temp_password),
        must_change_password=True,
    )
    db.add(user)
    db.flush()

    for cluster_id in payload.cluster_ids:
        db.add(UserClusterAccess(user_id=user.id, cluster_id=cluster_id))

    db.commit()
    db.refresh(user)
    return UserCreatedOut(user=UserOut.model_validate(user), temporary_password=temp_password)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.post("/{user_id}/reset-password", response_model=UserCreatedOut)
def reset_password(
    user_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    temp_password = generate_temp_password()
    user.hashed_password = hash_password(temp_password)
    user.must_change_password = True
    db.commit()
    db.refresh(user)
    return UserCreatedOut(user=UserOut.model_validate(user), temporary_password=temp_password)


@router.put("/{user_id}/clusters", response_model=UserWithClusters)
def set_user_clusters(
    user_id: str,
    payload: SetUserClustersRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.query(UserClusterAccess).filter(UserClusterAccess.user_id == user_id).delete()
    for cluster_id in payload.cluster_ids:
        db.add(UserClusterAccess(user_id=user_id, cluster_id=cluster_id))
    db.commit()
    return _with_clusters(user, db)
