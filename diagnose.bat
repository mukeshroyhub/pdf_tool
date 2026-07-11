@echo off
cd /d "%~dp0"
echo Running diagnostics... > diagnose.txt
echo === node version === >> diagnose.txt
node --version >> diagnose.txt 2>&1
echo === dev-migrate direct === >> diagnose.txt
node apps\api\scripts\dev-migrate.mjs >> diagnose.txt 2>&1
echo === dev-migrate exit code: %errorlevel% === >> diagnose.txt
echo === npm run setup === >> diagnose.txt
call npm run setup >> diagnose.txt 2>&1
echo === setup exit code: %errorlevel% === >> diagnose.txt
echo Done. Results saved to diagnose.txt
type diagnose.txt
pause
