"""
Конфигурация GeoRadar CRM.

Значения по умолчанию можно переопределить переменными окружения
(например, в панели Render: ADMIN_PASSWORD, AI_API_KEY и т.д.).
"""
import os

# ---------- Административный доступ ----------
# Панель «AI Офферы» доступна только администраторам.
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "osposmak")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Mair2003")

# Срок жизни админ-сессии (в секундах). По истечении потребуется повторный вход.
ADMIN_SESSION_TTL = int(os.environ.get("ADMIN_SESSION_TTL", str(12 * 60 * 60)))

# ---------- Нейросеть для генерации офферов (провайдер Zexkora) ----------
# OpenAI-совместимый эндпоинт (…/v1), к которому добавляется /chat/completions.
# Адрес, ключ и модель задаются только переменными окружения: AI_BASE_URL / AI_API_KEY / AI_MODEL.
AI_BASE_URL = os.environ.get("AI_BASE_URL", "").rstrip("/")
AI_API_KEY = os.environ.get("AI_API_KEY", "")
AI_MODEL = os.environ.get("AI_MODEL", "")

# ---------- Профиль продавца для офферов (задача C) ----------
SELLER_NAME = os.environ.get("SELLER_NAME", "")
SELLER_ROLE = os.environ.get("SELLER_ROLE", "веб-разработчик")
SELLER_SERVICES = os.environ.get("SELLER_SERVICES", "")
HOOK_STYLE = os.environ.get("HOOK_STYLE", "A")

# Таймауты запроса к нейросети (сек): подключение / чтение.
# Чтение — с большим запасом: reasoning-модель может думать над шаблоном несколько минут,
# короткий лимит обрывал генерацию, и фронт уходил в повторные обновления списка.
AI_CONNECT_TIMEOUT = int(os.environ.get("AI_CONNECT_TIMEOUT", "30"))
AI_READ_TIMEOUT = int(os.environ.get("AI_READ_TIMEOUT", "600"))

# Лимиты загрузки таблиц
UPLOAD_MAX_ROWS = 2000
UPLOAD_MAX_SIZE_MB = 10
