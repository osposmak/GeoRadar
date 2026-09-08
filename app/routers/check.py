from datetime import date
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models import ParseRecord
from app.schemas import CheckResponse, DuplicateMatchItem

router = APIRouter(prefix="/api/check", tags=["Радар дублей"])

@router.get("", response_model=CheckResponse)
def check_duplicate(
    city: str = Query(..., min_length=1, description="Город для проверки"),
    niche: str = Query(..., min_length=1, description="Ниша для проверки"),
    db: Session = Depends(get_db)
):
    clean_city = city.strip()
    clean_niche = niche.strip()

    # Поиск записей с нечувствительностью к регистру
    query = db.query(ParseRecord).filter(
        func.lower(ParseRecord.city) == clean_city.lower(),
        func.lower(ParseRecord.niche) == clean_niche.lower()
    ).order_by(ParseRecord.parsed_date.desc())

    records = query.all()

    # Если точных нет, проверим частичные совпадения по нише в этом же городе
    if not records:
        partial_query = db.query(ParseRecord).filter(
            func.lower(ParseRecord.city) == clean_city.lower(),
            func.lower(ParseRecord.niche).contains(clean_niche.lower())
        ).order_by(ParseRecord.parsed_date.desc())
        records = partial_query.all()

    today = date.today()

    if not records:
        return CheckResponse(
            city_query=clean_city,
            niche_query=clean_niche,
            is_duplicate=False,
            status="safe",
            headline="Чисто! Ниша свободна для сбора 🎉",
            message=f"В городе <b>{clean_city}</b> по направлению <b>«{clean_niche}»</b> парсинг ещё ни разу не проводился. Дорога открыта!",
            mascot_mood="celebrate",
            days_since_last=None,
            last_parsed_date=None,
            total_found_records=0,
            matches=[],
            recommended_action="Запустите сбор и нажмите «Занять нишу в работу», чтобы зафиксировать бронь за собой."
        )

    # Найдены записи
    latest = records[0]
    days_ago = (today - latest.parsed_date).days if latest.parsed_date else 0
    if days_ago < 0:
        days_ago = 0

    match_items = []
    for r in records:
        item_days = (today - r.parsed_date).days if r.parsed_date else 0
        match_items.append(DuplicateMatchItem(
            id=r.id,
            city=r.city,
            niche=r.niche,
            source=r.source,
            status=r.status,
            records_count=r.records_count,
            operator_name=r.operator_name,
            parsed_date=r.parsed_date,
            days_ago=max(0, item_days),
            notes=r.notes
        ))

    # Логика критичности давности
    if days_ago <= 60:
        # Свежий дубль (<60 дней)
        status = "danger"
        mascot_mood = "alert"
        headline = f"Внимание! Обнаружен свежий дубль! 📢"
        message = (
            f"Связка <b>{latest.city}</b> + <b>«{latest.niche}»</b> уже парсилась <b>{days_ago} дн. назад</b> "
            f"({latest.parsed_date.strftime('%d.%m.%Y')}). "
            f"Оператор: <b>{latest.operator_name}</b>, источник: <b>{latest.source}</b>. "
            f"Собрано: <b>{latest.records_count}</b> контактов/компаний."
        )
        recommended_action = "Повторный сбор НЕ рекомендуется! Данные актуальны. Используйте готовую базу из архива или выберите другую нишу."
    else:
        # Старый сбор (>60 дней), имеет смысл обновить
        status = "warning"
        mascot_mood = "standing"
        headline = f"Ниша парсилась {days_ago} дн. назад — пора обновить! 🕒"
        message = (
            f"По связке <b>{latest.city}</b> + <b>«{latest.niche}»</b> сбор был <b>{days_ago} дн. назад</b> "
            f"({latest.parsed_date.strftime('%d.%m.%Y')}). "
            f"Тогда собрали <b>{latest.records_count}</b> контактов."
        )
        recommended_action = "База могла устареть. Рекомендуется повторный сбор для актуализации телефонных номеров и новых компаний."

    return CheckResponse(
        city_query=clean_city,
        niche_query=clean_niche,
        is_duplicate=True,
        status=status,
        headline=headline,
        message=message,
        mascot_mood=mascot_mood,
        days_since_last=days_ago,
        last_parsed_date=latest.parsed_date,
        total_found_records=len(records),
        matches=match_items,
        recommended_action=recommended_action
    )
