import os
from datetime import date, timedelta
from app.database import SessionLocal, BASE_DIR, DATA_DIR
from app.models import ParseRecord

SEEDED_FLAG_FILE = os.path.join(DATA_DIR, ".seeded")

def seed_sample_data(force: bool = False):
    """
    Заполняет базу демонстрационными данными ТОЛЬКО при первом запуске.
    Если база была очищена пользователем, повторно не заполняется,
    пока не будет вызван принудительный сброс (force=True).
    """
    if not force and os.path.exists(SEEDED_FLAG_FILE):
        return

    db = SessionLocal()
    try:
        count = db.query(ParseRecord).count()
        if count > 0 and not force:
            with open(SEEDED_FLAG_FILE, "w", encoding="utf-8") as f:
                f.write("seeded")
            return

        today = date.today()

        samples = [
            ParseRecord(
                city="Тюмень",
                niche="Мебель",
                source="2ГИС",
                status="Завершено",
                records_count=142,
                operator_name="Алексей",
                parsed_date=today - timedelta(days=3),
                notes="Собраны мебельные фабрики, салоны кухонь и шкафов-купе. Номера с мобильными проверены."
            ),
            ParseRecord(
                city="Тюмень",
                niche="Стоматологии",
                source="Яндекс Карты",
                status="Завершено",
                records_count=89,
                operator_name="Мария",
                parsed_date=today - timedelta(days=12),
                notes="Частные стоматологические клиники и ортодонтия. Высокая конверсия."
            ),
            ParseRecord(
                city="Москва",
                niche="Автосервисы",
                source="2ГИС + Яндекс",
                status="Завершено",
                records_count=640,
                operator_name="Дмитрий",
                parsed_date=today - timedelta(days=5),
                notes="СВАО и САО округа. СТО, шиномонтажи и кузовной ремонт."
            ),
            ParseRecord(
                city="Санкт-Петербург",
                niche="Кофейни",
                source="2ГИС",
                status="Завершено",
                records_count=310,
                operator_name="Елена",
                parsed_date=today - timedelta(days=18),
                notes="Спешелти кофейни и сетевые точки в центре."
            ),
            ParseRecord(
                city="Екатеринбург",
                niche="Строительные компании",
                source="Яндекс Карты",
                status="Завершено",
                records_count=215,
                operator_name="Алексей",
                parsed_date=today - timedelta(days=4),
                notes="Генподрядчики, малоэтажное строительство, коттеджи."
            ),
            ParseRecord(
                city="Казань",
                niche="Отели и гостиницы",
                source="2ГИС + Яндекс",
                status="Требует обновления",
                records_count=118,
                operator_name="Иван",
                parsed_date=today - timedelta(days=88),
                notes="Сбор проводился давно. Рекомендуется повторный проход."
            ),
            ParseRecord(
                city="Новосибирск",
                niche="Салоны красоты",
                source="2ГИС",
                status="Требует обновления",
                records_count=295,
                operator_name="Мария",
                parsed_date=today - timedelta(days=72),
                notes="Много закрывшихся и переехавших точек."
            ),
            ParseRecord(
                city="Тюмень",
                niche="Фитнес-клубы",
                source="2ГИС + Яндекс",
                status="В процессе",
                records_count=45,
                operator_name="Алексей",
                parsed_date=today,
                notes="В процессе сбора."
            ),
            ParseRecord(
                city="Краснодар",
                niche="Агентства недвижимости",
                source="Яндекс Карты",
                status="Завершено",
                records_count=380,
                operator_name="Дмитрий",
                parsed_date=today - timedelta(days=22),
                notes="Риелторы и отделы продаж."
            )
        ]

        db.add_all(samples)
        db.commit()

        # Ставим маркер, что начальный сид произведён
        with open(SEEDED_FLAG_FILE, "w", encoding="utf-8") as f:
            f.write("seeded")

        print("[GeoRadar] Демонстрационные данные загружены.")
    except Exception as e:
        db.rollback()
        print(f"[GeoRadar] Ошибка сида: {e}")
    finally:
        db.close()

def clear_all_records():
    """Полностью очищает базу данных и сохраняет флаг, чтобы не перезаливать демо."""
    db = SessionLocal()
    try:
        db.query(ParseRecord).delete()
        db.commit()
        # Создаем маркер, чтобы при перезапуске сервера не восстанавливались демо-данные
        with open(SEEDED_FLAG_FILE, "w", encoding="utf-8") as f:
            f.write("cleared_by_user")
        return True
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()
