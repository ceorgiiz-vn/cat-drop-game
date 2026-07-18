@echo off
chcp 65001 >nul
title Cat Drop - локальный сервер (основная игра)
cd /d "%~dp0www"

echo ============================================
echo   Cat Drop — локальный сервер (основная игра)
echo   Адрес:  http://localhost:8080
echo   Закрыть сервер: закрой это окно.
echo ============================================
echo.

rem Откроем браузер через ~2 секунды (в фоне), пока стартует сервер
start "" /min cmd /c "ping -n 3 127.0.0.1 >nul & start "" http://localhost:8080"

rem 1) Пробуем Node (serve). 2) Python. 3) py.
where npx >nul 2>nul
if %errorlevel%==0 (
    echo Запускаю через Node (serve)...
    npx --yes serve -l 8080 .
    goto :end
)
where python >nul 2>nul
if %errorlevel%==0 (
    echo Запускаю через Python...
    python -m http.server 8080
    goto :end
)
where py >nul 2>nul
if %errorlevel%==0 (
    echo Запускаю через Python (py)...
    py -m http.server 8080
    goto :end
)

echo.
echo [!] Не найден ни Node.js, ни Python.
echo     Установи Node.js (nodejs.org) ИЛИ Python (python.org) и запусти файл снова.
echo.
:end
pause
