@echo off
chcp 65001 >nul
title Cat Drop — сборка .aab для Google Play
cd /d "%~dp0"

echo ============================================================
echo   Cat Drop — сборка обновления (.aab) для Google Play Console
echo   versionCode 5  /  versionName 2.3
echo ------------------------------------------------------------
echo   Нужно один раз: установленный Android Studio (Android SDK)
echo   и файл ключа подписи ~/.catdrop/keystore.properties
echo ============================================================
echo.

echo [1/2] Синхронизирую веб-игру (www) в Android-проект...
call npx --yes cap copy android
if errorlevel 1 (
  echo.
  echo [!] Не удалось синхронизировать www.
  echo     Проверь: установлен Node.js и в папке проекта есть node_modules
  echo     (если нет — один раз выполнится "npm install" при запуске лаунчера сервера).
  pause
  exit /b 1
)

echo.
echo [2/2] Собираю подписанный .aab через Gradle (это займёт пару минут)...
cd android
call gradlew.bat --no-daemon bundleRelease
if errorlevel 1 (
  echo.
  echo [!] Сборка не удалась. Частые причины:
  echo     - Android SDK не настроен (открой проект в Android Studio хотя бы раз,
  echo       чтобы создался android\local.properties с путём к SDK);
  echo     - нет ключа подписи ~/.catdrop/keystore.properties (storeFile/пароли/alias).
  echo     Смотри текст ошибки выше.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo   ГОТОВО!  Загрузи этот файл в Google Play Console:
echo   android\app\build\outputs\bundle\release\app-release.aab
echo ============================================================
start "" "%~dp0android\app\build\outputs\bundle\release"
pause
