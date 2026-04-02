@echo off
REM Change the current directory to the directory where this batch file is located
CD "C:\Users\muk0003\OneDrive - Auburn University\Desktop\Realtime-Transit-Database"

CALL .venv\Scripts\activate
CD "C:\Users\muk0003\OneDrive - Auburn University\Desktop\Realtime-Transit-Database\frontend\GTFS-UI"
REM Your commands after activation
python main.py
python create_files.py
git add meta
git commit -m "Update delay folder from MongoDB"
git push origin main