import os
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from app.database import init_db
from app.seed_data import seed_sample_data
from app.routers import check, parses, analytics, export, auth, offers

app = FastAPI(
    title="GeoRadar CRM - Контроль парсинга гео-сервисов",
    description="Интеллектуальная система контроля парсинга Яндекс Карт и 2ГИС с предотвращением дублей и аналитикой",
    version="1.0.0"
)

# Разрешаем CORS для комфортной работы
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Подключаем роутеры
app.include_router(check.router)
app.include_router(parses.router)
app.include_router(analytics.router)
app.include_router(export.router)
app.include_router(auth.router)
app.include_router(offers.router)

# Пути к статическим файлам
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

# Монтируем статику
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.on_event("startup")
def on_startup():
    """Инициализация базы данных и демо-записей при первом старте."""
    init_db()
    seed_sample_data()

@app.get("/")
def serve_home():
    """Отдает главную страницу приложения."""
    index_file = os.path.join(STATIC_DIR, "index.html")
    return FileResponse(index_file)

@app.get("/health")
def health_check():
    return {"status": "ok", "app": "GeoRadar CRM", "version": "1.0.0"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
