@echo off
REM Change the current directory to the directory where this batch file is located
CD C:\Users\muk0003\OneDrive - Auburn University\Desktop\Realtime-Transit-Database

CALL .venv\Scripts\activate
REM Your commands after activation
python tasks\seek_schedules.py
