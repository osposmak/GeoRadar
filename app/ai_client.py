"""
Клиент нейросети для генерации офферов холодного обзвона.

Работает с OpenAI-совместимым API (POST {AI_API_URL}/chat/completions).
Модель: GLM-5.3. Ключ и адрес задаются в app/config.py.
"""
import json
import re
from datetime import datetime

import httpx

from app import config


class AIGenerationError(Exception):
    """Ошибка обращения к нейросети или разбора ответа."""


# Системный промпт: нейросеть выступает в роли топ-эксперта по холодным
# звонкам в B2B, который продаёт разработку и модернизацию сайтов.
SYSTEM_PROMPT = """Ты — senior-специалист по холодным B2B-продажам с 15-летним опытом. Ты продаёшь разработку и модернизацию сайтов малому и среднему бизнесу (студия веб-разработки). Ты досконально знаешь психологию продаж, структуру идеального холодного звонка, техники: «крючок» в первые 10 секунд, SPIR, PAS (проблема-усиление-решение), отработку возражений («дорого», «нам не надо», «уже есть сайт», «подумаю», «пришлите КП»), принцип взаимности, социальное доказательство, дефицит и дедлайн.

Твоя задача — подготовить оператору короткий, живой и убедительный скрипт звонка владельцу/руководителю компании. Правила:

1. Пиши разговорным языком, как реально говорят по телефону: короткие фразы, без канцелярита и без слов «уникальный», «инновационный», «синергия».
2. Обращение на «вы» к собеседнику, но текст — инструкция для оператора.
3. Максимальная персонализация: используй нишу, город, название компании и состояние сайта (нет сайта / сайт мёртвый / слабый сайт). Боль ниши должна угадываться: например, салоны красоты теряют клиентов на записи, мебельщики продают через фото — им нужен визуал, автосервисы живут на повторных клиентах и т.д.
4. Крючок — одна фраза, после которой собеседник не кладёт трубку: цепляющее наблюдение о его бизнесе + выгода, без «здравствуйте, меня зовут…» в первых словах (представление — сразу после крючка).
5. Оффер — конкретика: что сделаем, выгода для бизнеса (больше звонков/заявок), социальное доказательство, ориентир по срокам. Не выдумывай точные цены — давай вилку «от …» или обещание «назову точную стоимость после 5 минут анализа».
6. Возражения — 3 самых вероятных для этой ниши, к каждому готовый короткий ответ.
7. Закрытие — один конкретный вопрос, предполагающий согласие (альтернативный вопрос «вам удобнее завтра до обеда или после?»).

Формат ответа: только валидный JSON без markdown-обёрток:
{
  "hook": "крючок + представление, 2-3 предложения",
  "offer": "основной оффер, 4-6 предложений",
  "objections": "возражение 1 — ответ. Возражение 2 — ответ. Возражение 3 — ответ.",
  "closing": "фраза закрытия, 1-2 предложения"
}"""

USER_PROMPT_TEMPLATE = """Составь скрипт холодного звонка для этой компании:

- Название: {name}
- Ниша/категория: {niche}
- Город: {city}
- Адрес: {address}
- Сайт: {website}
- Дополнительно из таблицы: {extra}

Если сайт отсутствует — главный аргумент: «клиенты сейчас уходят к конкурентам, которых находят в поиске и на картах». Если сайт указан — акцент на аудит и модернизацию (скорость, мобильная версия, захват заявок). Если ниша не указана — определи её по названию компании."""


def _extract_json(text: str) -> dict:
    """Достаёт JSON из ответа модели (устойчиво к ```json-обёрткам и мусору)."""
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
    cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Ищем первый {...} балансом скобок
    start = cleaned.find("{")
    if start == -1:
        raise AIGenerationError("Нейросеть вернула ответ без JSON")
    depth = 0
    for i in range(start, len(cleaned)):
        if cleaned[i] == "{":
            depth += 1
        elif cleaned[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(cleaned[start:i + 1])
                except json.JSONDecodeError:
                    break
    raise AIGenerationError("Не удалось разобрать JSON из ответа нейросети")


def generate_pitch(lead: dict) -> dict:
    """
    Генерирует оффер для лида. Возвращает dict с ключами
    hook / offer / objections / closing. Бросает AIGenerationError при сбое.
    """
    user_prompt = USER_PROMPT_TEMPLATE.format(
        name=lead.get("company_name") or "не указано",
        niche=lead.get("niche") or "не указана",
        city=lead.get("city") or "не указан",
        address=lead.get("address") or "—",
        website=lead.get("website") or "отсутствует",
        extra=(lead.get("extra_info") or "—")[:500],
    )

    payload = {
        "model": config.AI_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.7,
        # GLM-5.3 — reasoning-модель: сначала «думает» в reasoning_content,
        # затем пишет ответ. Лимит должен покрывать размышления + ответ,
        # иначе content приходит пустым с finish_reason="length".
        "max_tokens": 8000
    }
    headers = {
        "Authorization": f"Bearer {config.AI_API_KEY}",
        "Content-Type": "application/json"
    }

    try:
        response = httpx.post(
            f"{config.AI_API_URL}/chat/completions",
            json=payload,
            headers=headers,
            timeout=httpx.Timeout(config.AI_READ_TIMEOUT, connect=config.AI_CONNECT_TIMEOUT)
        )
    except httpx.HTTPError as e:
        raise AIGenerationError(f"Сеть недоступна: {e.__class__.__name__}")

    if response.status_code != 200:
        detail = response.text[:300] if response.text else "пустой ответ"
        raise AIGenerationError(f"API вернул {response.status_code}: {detail}")

    try:
        body = response.json()
        content = body["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError):
        raise AIGenerationError("Неожиданный формат ответа API")

    if not content or not content.strip():
        raise AIGenerationError(
            "Нейросеть вернула пустой ответ: модель потратила весь лимит токенов на размышления. Повторите попытку."
        )

    parsed = _extract_json(content)

    result = {
        "hook": str(parsed.get("hook") or "").strip(),
        "offer": str(parsed.get("offer") or "").strip(),
        "objections": str(parsed.get("objections") or parsed.get("objection") or "").strip(),
        "closing": str(parsed.get("closing") or "").strip(),
    }

    # Если модель вернула текст не по полям — кладём всё в offer, чтобы не терять ответ
    if not any(result.values()):
        result["offer"] = content.strip()[:4000]

    return result


def is_configured() -> bool:
    return bool(config.AI_API_URL and config.AI_API_KEY and config.AI_MODEL)
