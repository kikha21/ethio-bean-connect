@echo off
schtasks /Create /TN "EBC Weekly Backup" /TR "\"C:\Users\kikha21\OneDrive\Desktop\ETHIO BEAN WEBSITE\backup-scripts\pull-backup.bat\"" /SC WEEKLY /D TUE,FRI /ST 12:00 /F