"""
Авторизация администратора для панели «AI Офферы».

Простая схема с токенами в памяти: логин/пароль проверяются против
app/config.py, в ответ выдаётся токен с ограниченным сроком жизни.
"""
import secrets
import threading
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException

from app import config
from app.schemas import LoginRequest, LoginResponse

router = APIRouter(prefix="/api/auth", tags=["Авторизация"])

# {token: expires_at} — переживает запросы, но не перезапуск сервера
_sessions: dict = {}
_lock = threading.Lock()


def _cleanup_sessions() -> None:
    now = datetime.utcnow()
    expired = [t for t, exp in _sessions.items() if exp < now]
    for t in expired:
        _sessions.pop(t, None)


def require_admin(authorization: str = Header(default="")) -> None:
    """Dependency: пропускает только запросы с валидным админ-токеном."""
    token = authorization.replace("Bearer ", "").strip() if authorization else ""
    if not token or token not in _sessions:
        raise HTTPException(status_code=401, detail="Требуется вход администратора")
    if _sessions[token] < datetime.utcnow():
        _sessions.pop(token, None)
        raise HTTPException(status_code=401, detail="Сессия истекла, войдите заново")


@router.post("/login", response_model=LoginResponse)
def login(credentials: LoginRequest):
    """Проверяет логин/пароль администратора и выдаёт токен сессии."""
    if credentials.username.strip() != config.ADMIN_USERNAME or credentials.password != config.ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")

    with _lock:
        _cleanup_sessions()
        token = secrets.token_hex(32)
        expires_at = datetime.utcnow() + timedelta(seconds=config.ADMIN_SESSION_TTL)
        _sessions[token] = expires_at

    return LoginResponse(token=token, username=config.ADMIN_USERNAME, expires_at=expires_at)


@router.post("/logout")
def logout(authorization: str = Header(default="")):
    token = authorization.replace("Bearer ", "").strip() if authorization else ""
    with _lock:
        _sessions.pop(token, None)
    return {"status": "ok"}


@router.get("/me")
def me(authorization: str = Header(default="")):
    try:
        require_admin(authorization=authorization)
    except HTTPException:
        return {"authenticated": False}
    return {"authenticated": True, "username": config.ADMIN_USERNAME}
