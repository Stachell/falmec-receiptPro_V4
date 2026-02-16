@echo off
REM ============================================================
REM devlogic PDF-PARSER_V1 - API Server
REM Startet den FastAPI-Server auf Port 8090
REM React-App verbindet sich automatisch mit diesem Server
REM ============================================================

setlocal
set "ROOT_DIR=%~dp0.."
set "PYTHON=%ROOT_DIR%\.venv\Scripts\python.exe"

if not exist "%PYTHON%" (
    echo [ERROR] Virtual environment nicht gefunden.
    echo         Bitte zuerst setup_env.bat ausfuehren!
    echo.
    pause
    exit /b 1
)

echo.
echo ==========================================
echo   devlogic PDF-PARSER_V1 - API Server
echo   Port: 8090
echo   React-App: http://localhost:8080
echo ==========================================
echo.

REM Check if port 8090 is already in use
netstat -an | findstr ":8090" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [WARNING] Port 8090 ist bereits belegt!
    echo           Bitte stoppe den laufenden Prozess oder verwende einen anderen Port.
    echo.
    pause
    exit /b 1
)

echo [INFO] Server startet...
echo [INFO] Stoppen mit Ctrl+C
echo.
echo [TIP]  Nach dem Start erreichbar unter:
echo        Health Check: http://localhost:8090/health
echo        Debug Text:   http://localhost:8090/debug/extract-text
echo.

cd /d "%ROOT_DIR%"
"%PYTHON%" -m uvicorn logicdev_API.server:app --host 0.0.0.0 --port 8090 --reload

echo.
echo [INFO] Server wurde gestoppt.
echo.

pause
