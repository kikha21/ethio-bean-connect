@echo off
REM Starts Ethio Bean Connect and opens a public address for it.
REM Two windows appear. Closing either one takes the site down.

cd /d "%~dp0"

echo Starting the site on http://localhost:4400 ...
start "Ethio Bean Connect - site" cmd /k "node platform\server.js"

timeout /t 4 /nobreak >nul

echo Opening the public address ...
echo.
echo    The https://...trycloudflare.com line in the second window
echo    is the address to share. It changes every time you restart.
echo.
start "Ethio Bean Connect - public address" cmd /k ""C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url http://localhost:4400 --no-autoupdate"

timeout /t 3 /nobreak >nul
echo Both are running. Leave both windows open.
pause
