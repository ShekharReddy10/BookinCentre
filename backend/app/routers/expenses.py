from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user, require_roles
from app.database import get_db
from app.models import Expense, User, UserRole
from app.schemas import ExpenseCreate, ExpenseOut

router = APIRouter(prefix="/expenses", tags=["expenses"])


@router.get("", response_model=List[ExpenseOut])
def list_expenses(
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Expense)
    if from_date:
        q = q.filter(Expense.date >= from_date)
    if to_date:
        q = q.filter(Expense.date <= to_date)
    return q.order_by(Expense.date.desc()).all()


@router.post("", response_model=ExpenseOut)
def create_expense(
    payload: ExpenseCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin, UserRole.manager)),
):
    expense = Expense(**payload.model_dump())
    db.add(expense)
    db.commit()
    db.refresh(expense)
    return expense


@router.delete("/{expense_id}")
def delete_expense(
    expense_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.admin, UserRole.manager)),
):
    expense = db.query(Expense).filter(Expense.id == expense_id).first()
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    db.delete(expense)
    db.commit()
    return {"ok": True}
