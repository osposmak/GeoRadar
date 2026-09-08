from typing import Optional, List
from datetime import date, datetime
from pydantic import BaseModel, Field

class ParseRecordBase(BaseModel):
    city: str = Field(..., description="Город поиска (например, Тюмень)")
    niche: str = Field(..., description="Ниша / категория (например, Мебель)")
    source: str = Field(default="2ГИС + Яндекс", description="Источник (Яндекс Карты, 2ГИС, 2ГИС + Яндекс)")
    status: str = Field(default="Завершено", description="Статус задачи")
    records_count: int = Field(default=0, description="Количество собранных контактов/организаций")
    operator_name: str = Field(default="Менеджер", description="Имя ответственного сотрудника")
    parsed_date: date = Field(default_factory=date.today, description="Дата парсинга")
    notes: Optional[str] = Field(default="", description="Заметки или комментарии")
    file_attachment: Optional[str] = Field(default=None, description="Имя прикрепленного файла или выгрузки")

class ParseRecordCreate(ParseRecordBase):
    pass

class ParseRecordUpdate(BaseModel):
    city: Optional[str] = None
    niche: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    records_count: Optional[int] = None
    operator_name: Optional[str] = None
    parsed_date: Optional[date] = None
    notes: Optional[str] = None
    file_attachment: Optional[str] = None

class ParseRecordOut(ParseRecordBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# -------------------------------------------------------------
# Схемы для Радара Проверки Дубликатов
# -------------------------------------------------------------

class DuplicateMatchItem(BaseModel):
    id: int
    city: str
    niche: str
    source: str
    status: str
    records_count: int
    operator_name: str
    parsed_date: date
    days_ago: int
    notes: Optional[str] = None

class CheckResponse(BaseModel):
    city_query: str
    niche_query: str
    is_duplicate: bool
    status: str            # "danger" (свежий дубль <60дней), "warning" (старый >60дней), "safe" (свободно)
    headline: str          # Заголовок для маскота
    message: str           # Подробное сообщение от маскота
    mascot_mood: str       # "alert" (мегафон), "celebrate" (радость), "standing" (внимание)
    days_since_last: Optional[int] = None
    last_parsed_date: Optional[date] = None
    total_found_records: int
    matches: List[DuplicateMatchItem] = []
    recommended_action: str

# -------------------------------------------------------------
# Схемы для Аналитики и Дашборда
# -------------------------------------------------------------

class NameCount(BaseModel):
    name: str
    count: int
    total_records: int

class StatsSummary(BaseModel):
    total_parses: int
    total_contacts: int
    unique_cities: int
    unique_niches: int
    active_operators: int
    recent_7_days_parses: int
    sources_distribution: dict
    top_cities: List[NameCount]
    top_niches: List[NameCount]
