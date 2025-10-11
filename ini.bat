@REM generate gtfs_rt_pb2
@REM protoc --python_out=. gtfs-realtime.proto
protoc-32.1-win64\bin\protoc.exe --python_out=. gtfs-realtime.proto

@REM initizalize mongodb
python initialize_db.py