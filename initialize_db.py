import os
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()
database_url = os.getenv("DATABASE_URL")
db_name = os.getenv("DB_NAME")

client = MongoClient(database_url)
db = client[db_name]

c1n = os.getenv("COLLECTION_1_NAME")
c2n = os.getenv("COLLECTION_2_NAME")
c3n = os.getenv("COLLECTION_3_NAME")
c4n = os.getenv("COLLECTION_4_NAME")

collections = [c1n, c2n, c3n, c4n]
for collection in collections:
    if collection not in db.list_collection_names():
        db.create_collection(collection)