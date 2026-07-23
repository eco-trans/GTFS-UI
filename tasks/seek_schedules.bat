@echo off
REM Change the current directory to the directory where this batch file is located
CD /d D:\Projects\GTFS

CALL .venv\Scripts\activate
REM Your commands after activation
python tasks\seek_schedules.py
