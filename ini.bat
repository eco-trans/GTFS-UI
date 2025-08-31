@REM generate gtfs_rt_pb2
protoc --python_out=. gtfs-realtime.proto

@REM initizalize mongodb
python initialize_db.py