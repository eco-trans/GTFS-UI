@echo off
REM Change the current directory to the directory where this batch file is located
CD /d D:\Projects\GTFS

CALL .venv\Scripts\activate
CD /d D:\Projects\GTFS\frontend\GTFS-UI
REM Your commands after activation
python create_files.py
git add meta
git commit -m "Update delay folder from MongoDB"
git push origin main