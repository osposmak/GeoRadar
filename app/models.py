from datetime import datetime, date
from sqlalchemy import Column, Integer, String, Text, DateTime, Date, ForeignKey, Float
from sqlalchemy.orm import relationship
from app.database import Base

class AppMeta(Base):
    """
    Системные метаданные приложения (маркер инициализации БД, настройки).
    Хранятся в самой базе, поэтому сохраняются при любых перезапусках сервера.
    """
    __tablename__ = "app_meta"

    key = Column(String(50), primary_key=True)
    value = Column(String(255), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ParseRecord(Base):
    """
    Основная модель истории и учета парсингов.
    Фиксирует связку: Город + Ниша + Источник + Результаты.
    """
    __tablename__ = "parse_records"

    id = Column(Integer, primary_key=True, index=True)
    city = Column(String(100), nullable=False, index=True)
    niche = Column(String(150), nullable=False, index=True)
    source = Column(String(50), default="2ГИС + Яндекс", index=True)  # "2ГИС", "Яндекс Карты", "2ГИС + Яндекс"
    status = Column(String(50), default="Завершено", index=True)      # "Завершено", "В процессе", "Запланировано", "Требует обновления"
    records_count = Column(Integer, default=0)                        # Количество собранных компаний/контактов
    operator_name = Column(String(100), default="Менеджер", index=True) # Кто запускал/отвечает
    parsed_date = Column(Date, default=date.today, index=True)       # Дата проведения парсинга
    notes = Column(Text, nullable=True)                               # Комментарии, специфика сбора
    file_attachment = Column(String(255), nullable=True)              # Ссылка на файл выгрузки или имя архива
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Задел под CRM: связь с собранными компаниями
    companies = relationship("Company", back_populates="parse_record", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<ParseRecord {self.city} - {self.niche} ({self.source})>"


# -------------------------------------------------------------
# Модели фундамента CRM 2.0 (Компании и Лиды)
# -------------------------------------------------------------

class Company(Base):
    """
    Модель компании/организации, спарсенной из карт.
    Готова к наполнению при загрузке спарсенных файлов.
    """
    __tablename__ = "companies"

    id = Column(Integer, primary_key=True, index=True)
    parse_record_id = Column(Integer, ForeignKey("parse_records.id"), nullable=True)
    name = Column(String(255), nullable=False, index=True)
    city = Column(String(100), index=True)
    niche = Column(String(150), index=True)
    address = Column(String(255), nullable=True)
    phone = Column(String(100), nullable=True)
    website = Column(String(255), nullable=True)
    email = Column(String(100), nullable=True)
    rating = Column(Float, nullable=True)
    reviews_count = Column(Integer, default=0)
    source = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    parse_record = relationship("ParseRecord", back_populates="companies")
    leads = relationship("Lead", back_populates="company", cascade="all, delete-orphan")


class Lead(Base):
    """
    Модель лида / контакта для воронки продаж будущей CRM.
    """
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True)
    contact_name = Column(String(150), nullable=True)
    phone = Column(String(100), nullable=True)
    email = Column(String(100), nullable=True)
    stage = Column(String(50), default="Новый")  # "Новый", "Взят в работу", "Звонок назначен", "КП отправлено", "Отказ", "Успех"
    deal_amount = Column(Float, default=0.0)
    notes = Column(Text, nullable=True)
    assigned_to = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    company = relationship("Company", back_populates="leads")
