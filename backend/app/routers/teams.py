from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import require_roles
from app.database import get_db
from app.models import Team, TeamPermission, User, UserRole, UserTeam
from app.permissions import ALL_PERMISSIONS, PERMISSION_LABELS
from app.schemas import (
    SetTeamPermissionsRequest, SetTeamUsersRequest, SetUserTeamsRequest, TeamCreate, TeamOut, TeamUpdate,
    TeamWithPermissions,
)

router = APIRouter(prefix="/teams", tags=["teams"])


def _with_details(team: Team, db: Session) -> TeamWithPermissions:
    permissions = [r[0] for r in db.query(TeamPermission.permission).filter(TeamPermission.team_id == team.id).all()]
    user_ids = [r[0] for r in db.query(UserTeam.user_id).filter(UserTeam.team_id == team.id).all()]
    return TeamWithPermissions(**TeamOut.model_validate(team).model_dump(), permissions=permissions, user_ids=user_ids)


@router.get("/permissions")
def list_permission_keys(_: User = Depends(require_roles(UserRole.admin))):
    """The fixed list of assignable permission keys, with display labels."""
    return [{"key": k, "label": v} for k, v in PERMISSION_LABELS.items()]


@router.get("", response_model=List[TeamWithPermissions])
def list_teams(db: Session = Depends(get_db), _: User = Depends(require_roles(UserRole.admin))):
    teams = db.query(Team).order_by(Team.name).all()
    return [_with_details(t, db) for t in teams]


@router.post("", response_model=TeamWithPermissions)
def create_team(
    payload: TeamCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
):
    if db.query(Team).filter(Team.name == payload.name).first():
        raise HTTPException(status_code=400, detail="A team with this name already exists")
    team = Team(**payload.model_dump())
    db.add(team)
    db.commit()
    db.refresh(team)
    return _with_details(team, db)


@router.patch("/{team_id}", response_model=TeamWithPermissions)
def update_team(
    team_id: str,
    payload: TeamUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(team, field, value)
    db.commit()
    db.refresh(team)
    return _with_details(team, db)


@router.delete("/{team_id}")
def delete_team(
    team_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    db.delete(team)
    db.commit()
    return {"ok": True}


@router.put("/{team_id}/permissions", response_model=TeamWithPermissions)
def set_team_permissions(
    team_id: str,
    payload: SetTeamPermissionsRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    invalid = [p for p in payload.permissions if p not in ALL_PERMISSIONS]
    if invalid:
        raise HTTPException(status_code=400, detail=f"Unknown permission key(s): {', '.join(invalid)}")

    db.query(TeamPermission).filter(TeamPermission.team_id == team_id).delete()
    for perm in payload.permissions:
        db.add(TeamPermission(team_id=team_id, permission=perm))
    db.commit()
    return _with_details(team, db)


@router.put("/{team_id}/users", response_model=TeamWithPermissions)
def set_team_users(
    team_id: str,
    payload: SetTeamUsersRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
):
    team = db.query(Team).filter(Team.id == team_id).first()
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")

    valid_ids = {u.id for u in db.query(User.id).filter(User.id.in_(payload.user_ids)).all()}
    invalid = set(payload.user_ids) - valid_ids
    if invalid:
        raise HTTPException(status_code=404, detail=f"Unknown user id(s): {', '.join(invalid)}")

    db.query(UserTeam).filter(UserTeam.team_id == team_id).delete()
    for user_id in payload.user_ids:
        db.add(UserTeam(team_id=team_id, user_id=user_id))
    db.commit()
    return _with_details(team, db)


@router.put("/users/{user_id}/teams", response_model=List[TeamWithPermissions])
def set_user_teams(
    user_id: str,
    payload: SetUserTeamsRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin)),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    valid_ids = {t.id for t in db.query(Team.id).filter(Team.id.in_(payload.team_ids)).all()}
    invalid = set(payload.team_ids) - valid_ids
    if invalid:
        raise HTTPException(status_code=404, detail=f"Unknown team id(s): {', '.join(invalid)}")

    db.query(UserTeam).filter(UserTeam.user_id == user_id).delete()
    for team_id in payload.team_ids:
        db.add(UserTeam(user_id=user_id, team_id=team_id))
    db.commit()

    teams = db.query(Team).filter(Team.id.in_(payload.team_ids)).all()
    return [_with_details(t, db) for t in teams]
