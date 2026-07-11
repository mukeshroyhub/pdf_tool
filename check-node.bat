@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo NODE NOT FOUND > node-check.txt
  echo Node.js is NOT installed.
  echo.
  echo Install it with:  winget install OpenJS.NodeJS.LTS
  echo or download from: https://nodejs.org
) else (
  for /f "delims=" %%v in ('node --version') do echo NODE %%v > node-check.txt
  for /f "delims=" %%v in ('npm --version') do echo NPM %%v >> node-check.txt
  echo Node.js is installed:
  type node-check.txt
)
echo.
pause
