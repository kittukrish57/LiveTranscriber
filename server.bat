@echo off
echo ========================================
echo   Live Transcriber Server
echo   Opening at: http://localhost:8080
echo ========================================
echo.
echo Press Ctrl+C to stop the server
echo.

:: Try Python 3 first, then Python 2
python -m http.server 8080 2>nul || python -m SimpleHTTPServer 8080 2>nul || (
    echo Python not found!
    echo Install Python from python.org or use the PowerShell method below.
    echo.
    echo Alternative: Run this in PowerShell:
    echo   cd D:\kittu\Projects\LiveTranscriber
    echo   npx serve -p 8080
    pause
)
