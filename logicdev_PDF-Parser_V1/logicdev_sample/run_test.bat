@echo off
REM ============================================================
REM devlogic PDF-PARSER_V1 - Test Runner
REM Reads TESTPARSING.txt and runs the parser on sample PDFs
REM ============================================================

setlocal enabledelayedexpansion

echo.
echo ==========================================
echo   devlogic PDF-PARSER_V1 - Test Runner
echo ==========================================
echo.

REM Determine directories
set "SCRIPT_DIR=%~dp0"
set "ROOT_DIR=%SCRIPT_DIR%.."
set "VENV_DIR=%ROOT_DIR%\.venv"
set "PYTHON=%VENV_DIR%\Scripts\python.exe"

REM Check if venv exists
if not exist "%PYTHON%" (
    echo [ERROR] Virtual environment not found at %VENV_DIR%
    echo         Run setup_env.bat first!
    echo.
    pause
    exit /b 1
)

REM Run the test
echo [INFO] Using Python: %PYTHON%
echo [INFO] Config:  %SCRIPT_DIR%TESTPARSING.txt
echo.

"%PYTHON%" "%ROOT_DIR%\run_parse.py" ^
    --config "%SCRIPT_DIR%TESTPARSING.txt" ^
    --pdf-dir "%SCRIPT_DIR%test_pdfs" ^
    --output-dir "%SCRIPT_DIR%test_output"

echo.
echo [DONE] Check test_output\ for results.
echo.
pause
