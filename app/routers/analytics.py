from datetime import date, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from app.database import get_db
from app.models import ParseRecord

router = APIRouter(prefix="/api/analytics", tags=["Аналитика"])

@router.get("/summary")
def get_analytics_summary(db: Session = Depends(get_db)):
    total_parses = db.query(func.count(ParseRecord.id)).scalar() or 0
    total_contacts = db.query(func.sum(ParseRecord.records_count)).scalar() or 0
    unique_cities = db.query(func.count(func.distinct(ParseRecord.city))).scalar() or 0
    unique_niches = db.query(func.count(func.distinct(ParseRecord.niche))).scalar() or 0
    active_operators = db.query(func.count(func.distinct(ParseRecord.operator_name))).scalar() or 0

    week_ago = date.today() - timedelta(days=7)
    recent_7_days = db.query(func.count(ParseRecord.id)).filter(ParseRecord.parsed_date >= week_ago).scalar() or 0

    # Распределение по источникам
    sources_raw = db.query(
        ParseRecord.source,
        func.count(ParseRecord.id).label("count"),
        func.sum(ParseRecord.records_count).label("contacts")
    ).group_by(ParseRecord.source).all()

    sources_distribution = {
        r.source or "Не указан": {
            "count": r.count,
            "contacts": r.contacts or 0
        } for r in sources_raw
    }

    # Топ-8 городов по числу сборов и контактов
    top_cities_raw = db.query(
        ParseRecord.city,
        func.count(ParseRecord.id).label("count"),
        func.sum(ParseRecord.records_count).label("total_records")
    ).group_by(ParseRecord.city).order_by(desc("total_records")).limit(8).all()

    top_cities = [
        {"name": r.city, "count": r.count, "total_records": r.total_records or 0}
        for r in top_cities_raw
    ]

    # Топ-8 ниш
    top_niches_raw = db.query(
        ParseRecord.niche,
        func.count(ParseRecord.id).label("count"),
        func.sum(ParseRecord.records_count).label("total_records")
    ).group_by(ParseRecord.niche).order_by(desc("total_records")).limit(8).all()

    top_niches = [
        {"name": r.niche, "count": r.count, "total_records": r.total_records or 0}
        for r in top_niches_raw
    ]

    # Статусы
    status_raw = db.query(
        ParseRecord.status,
        func.count(ParseRecord.id).label("count")
    ).group_by(ParseRecord.status).all()
    status_distribution = {r.status: r.count for r in status_raw}

    return {
        "total_parses": total_parses,
        "total_contacts": total_contacts,
        "unique_cities": unique_cities,
        "unique_niches": unique_niches,
        "active_operators": active_operators,
        "recent_7_days_parses": recent_7_days,
        "sources_distribution": sources_distribution,
        "status_distribution": status_distribution,
        "top_cities": top_cities,
        "top_niches": top_niches
    }
