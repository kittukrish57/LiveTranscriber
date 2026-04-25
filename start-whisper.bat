@echo off
echo ========================================
echo   Whisper Transcription Server Setup
echo ========================================
echo.

:: Check if Python is installed (try py first, then python)
py --version >nul 2>&1
if errorlevel 1 (
    python --version >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Python not found!
        echo Please install Python from https://python.org
        pause
        exit /b 1
    )
    set PYCMD=python
) else (
    set PYCMD=py
)

echo [1/3] Checking dependencies...

:: Check if whisper is installed
%PYCMD% -c "import whisper" >nul 2>&1
if errorlevel 1 (
    echo [2/3] Installing OpenAI Whisper...
    %PYCMD% -m pip install openai-whisper
)

:: Check if flask is installed
%PYCMD% -c "import flask" >nul 2>&1
if errorlevel 1 (
    echo [2/3] Installing Flask...
    %PYCMD% -m pip install flask flask-cors
)

echo [3/3] Starting Whisper server...
echo.
echo ========================================
echo   Server will start at:
echo   http://localhost:5000
echo ========================================
echo.
echo First run will download the model (~74MB)
echo.

%PYCMD% whisper_server.py

pause
