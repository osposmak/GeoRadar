@echo off
chcp 65001 > nul
title GeoRadar CRM - Сервер запущен

echo ======================================================================
echo           🐾 GeoRadar CRM - Контроль парсинга Яндекс и 2ГИС
echo ======================================================================
echo.
echo [1/3] Проверка окружения Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo [ОШИБКА] Python не найден в системе! Установите Python 3.10+ с сайта python.org
    pause
    exit /b
)

echo [2/3] Проверка и установка зависимостей (FastAPI, SQLAlchemy, Uvicorn)...
python -m pip install -r requirements.txt --quiet

echo [3/3] Запуск локального сервера GeoRadar CRM...
echo.
echo ======================================================================
echo  Сервер запущен: http://127.0.0.1:8000
echo  Документация API: http://127.0.0.1:8000/docs
echo  База данных: data\georadar.db
echo ======================================================================
echo.
echo Открываю браузер...
start http://127.0.0.1:8000

python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
pause
