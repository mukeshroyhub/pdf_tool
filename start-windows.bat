@echo off
REM ── PDFForge one-click local start (Windows) ─────────────────────────
REM First run: installs dependencies (needs internet once) and sets up
REM the local database. After that everything runs fully offline.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js is not installed. Install it first, then re-run this script:
  echo   winget install OpenJS.NodeJS.LTS
  echo   ^(or download from https://nodejs.org^)
  echo.
  pause
  exit /b 1
)

echo Checking dependencies (fast when already installed)...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo npm install failed. Check your internet connection and try again.
  pause
  exit /b 1
)

echo Setting up local configuration and database...
call npm run setup
if errorlevel 1 (
  echo Setup failed - see the message above.
  pause
  exit /b 1
)

echo.
echo Starting PDFForge...  API on http://localhost:4000, app on http://localhost:3000
echo Press Ctrl+C to stop.
echo.
call npm run dev

echo.
echo PDFForge has stopped. Press any key to close this window.
pause >nul
