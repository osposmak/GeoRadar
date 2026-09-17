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

# ---------- Нейросеть для генерации офферов ----------
# OpenAI-совместимый эндпоинт (…/v1), к которому добавляется /chat/completions.
AI_API_URL = os.environ.get("AI_API_URL", "https://api.atria-asi.ai/v1").rstrip("/")
AI_API_KEY = os.environ.get("AI_API_KEY", "atr_XypP3FFfeBZE3EwgTgZnxcImplPbs6x5")
AI_MODEL = os.environ.get("AI_MODEL", "Atria-Dawn-Preview")

# Таймауты запроса к нейросети (сек): подключение / чтение.
# Чтение — с запасом: reasoning-модель может думать над шаблоном несколько минут.
AI_CONNECT_TIMEOUT = 20
AI_READ_TIMEOUT = 300

# Лимиты загрузки таблиц
UPLOAD_MAX_ROWS = 2000
UPLOAD_MAX_SIZE_MB = 10
