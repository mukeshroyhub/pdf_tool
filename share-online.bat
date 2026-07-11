@echo off
setlocal
title PDFForge - Public Link (Cloudflare Tunnel)

echo ============================================================
echo   PDFForge : create a free public link (Cloudflare Tunnel)
echo ============================================================
echo.
echo   BEFORE running this: start the app with start-windows.bat
echo   and confirm http://localhost:3000 opens in your browser.
echo.

where cloudflared >nul 2>&1
if errorlevel 1 (
  echo cloudflared is not installed. Installing it with winget...
  winget install --id Cloudflare.cloudflared -e --source winget --accept-package-agreements --accept-source-agreements
  echo.
  echo If it just installed, CLOSE this window and run share-online.bat again
  echo so Windows picks up the new command.
  echo.
  pause
  exit /b
)

echo Starting the tunnel. Your public https link appears below
echo (look for the line ending in .trycloudflare.com).
echo Keep this window open while sharing. Press Ctrl+C to stop.
echo.
cloudflared tunnel --url http://localhost:3000
