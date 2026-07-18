@echo off
chcp 65001 >nul
title Cat Drop - локальный сервер (соревновательная версия)
cd /d "%~dp0competitive-edition\www"

echo =====================================================
echo   Cat Drop — локальный сервер (соревновательная версия)
echo   Адрес:  http://localhost:8090
echo   Закрыть сервер: закрой это окно.
echo =====================================================
echo.

start "" /min cmd /c "ping -n 3 127.0.0.1 >nul & start "" http://localhost:8090"

where npx >nul 2>nul
if %errorlevel%==0 (
    echo Запускаю через Node (serve)...
    npx --yes serve -l 8090 .
    goto :end
)
where python >nul 2>nul
if %errorlevel%==0 (
    echo Запускаю через Python...
    python -m http.server 8090
    goto :end
)
where py >nul 2>nul
if %errorlevel%==0 (
    echo Запускаю через Python (py)...
    py -m http.server 8090
    goto :end
)

echo.
echo [!] Не найден ни Node.js, ни Python.
echo     Установи Node.js (nodejs.org) ИЛИ Python (python.org) и запусти файл снова.
echo.
:end
pause
