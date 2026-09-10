@echo off
REM ============================================================
REM Ethio Bean Connect - pull the latest backup to your PC
REM Run automatically twice a week by Windows Task Scheduler.
REM It copies the newest snapshot on the server down to Documents.
REM ============================================================

REM ---- Fill these in after your Oracle Cloud server exists ----
set SERVER_USER=ubuntu
set SERVER_IP=YOUR_SERVER_IP
set KEY="C:\Users\kikha21\.ssh\oracle_key"
set BACKUP_DIR=%USERPROFILE%\Documents\ebc-backups

REM ---- No need to change below this line ----
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

> "%BACKUP_DIR%\backup-log.txt" echo [%date% %time%] Starting backup pull

echo Pulling the newest Ethio Bean Connect backup from %SERVER_IP% ...
scp -i %KEY% %SERVER_USER%@%SERVER_IP%:/backups/ethiobean-*.db "%BACKUP_DIR%" 2>nul

if %errorlevel% equ 0 (
    echo Done. Backup saved to "%BACKUP_DIR%"
    >> "%BACKUP_DIR%\backup-log.txt" echo [%date% %time%] Backup saved OK
    echo Keeping only the 30 most recent copies...
    powershell -NoProfile -Command "Get-ChildItem '%BACKUP_DIR%' -Filter 'ethiobean-*.db' | Sort-Object LastWriteTime -Descending | Select-Object -Skip 30 | Remove-Item"
) else (
    echo.
    echo The backup could not be pulled. This usually means one of:
    echo   - Your PC is asleep or offline (skip, will try next time)
    echo   - The server is down
    echo   - You haven't filled in SERVER_IP / KEY at the top of this file
    >> "%BACKUP_DIR%\backup-log.txt" echo [%date% %time%] BACKUP FAILED
)

exit /b