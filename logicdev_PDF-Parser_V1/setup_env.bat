@echo off
REM ============================================================
REM devlogic PDF-PARSER_V1 - Environment Setup
REM Creates virtual environment and installs dependencies
REM ============================================================

echo.
echo ==========================================
echo   devlogic PDF-PARSER_V1 - Setup
echo ==========================================
echo.

set "ROOT_DIR=%~dp0"
set "VENV_DIR=%ROOT_DIR%.venv"

REM Create virtual environment
if not exist "%VENV_DIR%" (
    echo [INFO] Creating virtual environment...
    python -m venv "%VENV_DIR%"
    if errorlevel 1 (
        echo [ERROR] Failed to create virtual environment.
        echo         Make sure Python 3.10+ is installed and in PATH.
        pause
        exit /b 1
    )
) else (
    echo [INFO] Virtual environment already exists.
)

REM Install dependencies
echo [INFO] Installing dependencies...
"%VENV_DIR%\Scripts\pip.exe" install -r "%ROOT_DIR%requirements.txt" --quiet

if errorlevel 1 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

echo.
echo [DONE] Environment ready!
echo        Activate with: .venv\Scripts\activate
echo.
pause
