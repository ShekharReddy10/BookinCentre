"""Fixed set of permission keys, one per sidebar section/action. Teams grant a
subset of these; a user's effective permissions are the union of every team
they belong to. Admin-role users bypass this entirely and always have every
permission (same pattern as cluster access).

Adding a new sidebar section later just means adding a key here and to
PERMISSION_LABELS — no schema migration needed since permissions are stored
as free-text strings in team_permissions, not an enum column.
"""
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import TeamPermission, User, UserRole, UserTeam

PERMISSION_LABELS: dict[str, str] = {
    "dashboard.view": "Dashboard",
    "bookings.view": "Bookings",
    "calendar.view": "Calendar",
    "rooms.view": "Rooms",
    "reports.view": "Reports",
    "expenses.view": "Expenses",
    "guests.view": "Guests",
    "admin.users": "Admin: Users",
    "admin.clusters": "Admin: Clusters",
    "admin.automation": "Admin: Automation",
    "admin.teams": "Admin: Teams",
}

ALL_PERMISSIONS = list(PERMISSION_LABELS.keys())


def get_user_permissions(db: Session, user: User) -> list[str]:
    """Admins always have every permission. Everyone else gets the union of
    their teams' permissions.
    """
    if user.role == UserRole.admin:
        return list(ALL_PERMISSIONS)

    rows = (
        db.query(TeamPermission.permission)
        .join(UserTeam, UserTeam.team_id == TeamPermission.team_id)
        .filter(UserTeam.user_id == user.id)
        .distinct()
        .all()
    )
    return sorted({r[0] for r in rows})


def require_permission(key: str):
    """FastAPI dependency: 403s unless the current user has this permission (admins always pass)."""
    def checker(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> User:
        if current_user.role == UserRole.admin:
            return current_user
        if key not in get_user_permissions(db, current_user):
            raise HTTPException(status_code=403, detail=f"Missing permission: {key}")
        return current_user
    return checker
