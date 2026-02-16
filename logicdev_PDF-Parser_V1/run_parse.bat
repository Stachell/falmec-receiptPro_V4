@echo off
REM ============================================================
REM devlogic PDF-PARSER_V1 - Quick Parse Runner
REM Passes all arguments to run_parse.py
REM ============================================================

setlocal
set "ROOT_DIR=%~dp0"
set "PYTHON=%ROOT_DIR%.venv\Scripts\python.exe"

if not exist "%PYTHON%" (
    echo [ERROR] Virtual environment not found.
    echo         Run setup_env.bat first!
    pause
    exit /b 1
)

"%PYTHON%" "%ROOT_DIR%run_parse.py" %*
