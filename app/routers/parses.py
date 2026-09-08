from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from app.database import get_db
from app.models import ParseRecord
from app.schemas import ParseRecordCreate, ParseRecordUpdate, ParseRecordOut
from app.seed_data import clear_all_records, seed_sample_data

router = APIRouter(prefix="/api/parses", tags=["Журнал парсингов"])

@router.get("", response_model=List[ParseRecordOut])
def get_parses(
    search: Optional[str] = Query(None, description="Общий поиск по городу, нише или оператору"),
    city: Optional[str] = Query(None, description="Фильтр по городу"),
    niche: Optional[str] = Query(None, description="Фильтр по нише"),
    source: Optional[str] = Query(None, description="Фильтр по источнику (2ГИС, Яндекс Карты)"),
    status: Optional[str] = Query(None, description="Фильтр по статусу"),
    operator: Optional[str] = Query(None, description="Фильтр по сотруднику"),
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    query = db.query(ParseRecord)

    if search:
        s = f"%{search.strip()}%"
        query = query.filter(
            or_(
                ParseRecord.city.ilike(s),
                ParseRecord.niche.ilike(s),
                ParseRecord.operator_name.ilike(s),
                ParseRecord.notes.ilike(s)
            )
        )

    if city:
        query = query.filter(ParseRecord.city.ilike(f"%{city.strip()}%"))
    if niche:
        query = query.filter(ParseRecord.niche.ilike(f"%{niche.strip()}%"))
    if source and source != "Все":
        query = query.filter(ParseRecord.source == source)
    if status and status != "Все":
        query = query.filter(ParseRecord.status == status)
    if operator and operator != "Все":
        query = query.filter(ParseRecord.operator_name == operator)

    records = query.order_by(ParseRecord.parsed_date.desc(), ParseRecord.id.desc()).offset(offset).limit(limit).all()
    return records


@router.post("/clear-all")
def clear_database():
    """Полная очистка базы данных от всех записей."""
    clear_all_records()
    return {"status": "ok", "message": "База данных успешно очищена"}


@router.post("/reset-demo")
def reset_demo_database():
    """Восстановить демонстрационные данные для тестирования."""
    clear_all_records()
    seed_sample_data(force=True)
    return {"status": "ok", "message": "Демонстрационные данные восстановлены"}


@router.get("/meta/autocomplete")
def get_autocomplete_meta(db: Session = Depends(get_db)):
    """Возвращает списки уникальных городов, ниш и операторов для автодополнения."""
    cities = [r[0] for r in db.query(ParseRecord.city).distinct().order_by(ParseRecord.city).all() if r[0]]
    niches = [r[0] for r in db.query(ParseRecord.niche).distinct().order_by(ParseRecord.niche).all() if r[0]]
    operators = [r[0] for r in db.query(ParseRecord.operator_name).distinct().order_by(ParseRecord.operator_name).all() if r[0]]
    return {
        "cities": sorted(list(set(cities))),
        "niches": sorted(list(set(niches))),
        "operators": sorted(list(set(operators)))
    }


@router.get("/{record_id}", response_model=ParseRecordOut)
def get_parse_by_id(record_id: int, db: Session = Depends(get_db)):
    record = db.query(ParseRecord).filter(ParseRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return record


@router.post("", response_model=ParseRecordOut)
def create_parse(record_in: ParseRecordCreate, db: Session = Depends(get_db)):
    record = ParseRecord(
        city=record_in.city.strip(),
        niche=record_in.niche.strip(),
        source=record_in.source,
        status=record_in.status,
        records_count=record_in.records_count,
        operator_name=record_in.operator_name.strip() if record_in.operator_name else "Менеджер",
        parsed_date=record_in.parsed_date,
        notes=record_in.notes,
        file_attachment=record_in.file_attachment
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.put("/{record_id}", response_model=ParseRecordOut)
def update_parse(record_id: int, record_in: ParseRecordUpdate, db: Session = Depends(get_db)):
    record = db.query(ParseRecord).filter(ParseRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    update_data = record_in.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        if val is not None:
            if isinstance(val, str):
                val = val.strip()
            setattr(record, field, val)

    db.commit()
    db.refresh(record)
    return record


@router.delete("/{record_id}")
def delete_parse(record_id: int, db: Session = Depends(get_db)):
    record = db.query(ParseRecord).filter(ParseRecord.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    db.delete(record)
    db.commit()
    return {"status": "ok", "message": f"Запись #{record_id} успешно удалена"}
