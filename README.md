# Realtime-Transit-Database

1- Make sure that mongodb is installed and service is running in the background. also make sure to have a valid env file in the directory.

2- run the ini.bat file. It will generate gtfs_realtime_pb2.py using gtfs-realtime.proto. This file is downloaded from https://gtfs.org/documentation/realtime/proto/. ini.bat will also initialize the mongo db and will make sure that the db has same collections as required

