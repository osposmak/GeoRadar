import os
import sqlite3
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

# Path to database file inside project data directory
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
os.makedirs(DATA_DIR, exist_ok=True)

DB_PATH = os.path.join(DATA_DIR, "georadar.db")
SQLALCHEMY_DATABASE_URL = f"sqlite:///{DB_PATH}"

# Thread-safe SQLite engine with WAL mode support
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)

@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    """Настройка SQLite: Unicode-aware lower для русского языка и WAL режим."""
    if isinstance(dbapi_connection, sqlite3.Connection):
        # Переопределяем lower на Python str.lower для идеального поиска кириллицы (Тюмень == тюмень)
        dbapi_connection.create_function("lower", 1, lambda s: s.lower() if isinstance(s, str) else s)
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """FastAPI Dependency for database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initializes database tables."""
    Base.metadata.create_all(bind=engine)
