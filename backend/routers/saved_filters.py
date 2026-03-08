from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional

from database import get_db
from models import SavedFilter

router = APIRouter(prefix="/api/saved-filters", tags=["saved-filters"])


class SavedFilterCreate(BaseModel):
    name: str
    period_preset: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    type: Optional[str] = None
    search: Optional[str] = None


class SavedFilterUpdate(BaseModel):
    name: Optional[str] = None
    period_preset: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    type: Optional[str] = None
    search: Optional[str] = None


@router.get("")
def list_saved_filters(db: Session = Depends(get_db)):
    filters = db.query(SavedFilter).order_by(SavedFilter.created_at.desc()).all()
    return [
        {
            "id": f.id,
            "name": f.name,
            "period_preset": f.period_preset,
            "date_from": f.date_from,
            "date_to": f.date_to,
            "account_id": f.account_id,
            "category_id": f.category_id,
            "type": f.type,
            "search": f.search,
        }
        for f in filters
    ]


@router.post("")
def create_saved_filter(data: SavedFilterCreate, db: Session = Depends(get_db)):
    sf = SavedFilter(**data.model_dump())
    db.add(sf)
    db.commit()
    db.refresh(sf)
    return {"id": sf.id, "name": sf.name}


@router.put("/{filter_id}")
def update_saved_filter(filter_id: int, data: SavedFilterUpdate, db: Session = Depends(get_db)):
    sf = db.query(SavedFilter).get(filter_id)
    if not sf:
        raise HTTPException(status_code=404, detail="Filter not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(sf, k, v)
    db.commit()
    return {"id": sf.id, "name": sf.name}


@router.delete("/{filter_id}")
def delete_saved_filter(filter_id: int, db: Session = Depends(get_db)):
    sf = db.query(SavedFilter).get(filter_id)
    if not sf:
        raise HTTPException(status_code=404, detail="Filter not found")
    db.delete(sf)
    db.commit()
    return {"ok": True}
