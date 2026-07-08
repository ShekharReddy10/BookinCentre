from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_accessible_cluster_ids, get_current_user, require_roles
from app.database import get_db
from app.models import Cluster, User, UserRole
from app.schemas import ClusterCreate, ClusterOut, ClusterUpdate

router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.get("", response_model=List[ClusterOut])
def list_clusters(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    accessible = get_accessible_cluster_ids(current_user, db)
    q = db.query(Cluster)
    if accessible is not None:
        q = q.filter(Cluster.id.in_(accessible))
    return q.order_by(Cluster.name).all()


@router.post("", response_model=ClusterOut)
def create_cluster(
    payload: ClusterCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
):
    cluster = Cluster(**payload.model_dump())
    db.add(cluster)
    db.commit()
    db.refresh(cluster)
    return cluster


@router.patch("/{cluster_id}", response_model=ClusterOut)
def update_cluster(
    cluster_id: str,
    payload: ClusterUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
):
    cluster = db.query(Cluster).filter(Cluster.id == cluster_id).first()
    if not cluster:
        raise HTTPException(status_code=404, detail="Cluster not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(cluster, field, value)
    db.commit()
    db.refresh(cluster)
    return cluster
