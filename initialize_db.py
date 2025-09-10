import os
from dotenv import load_dotenv
from pymongo import MongoClient
from motor.motor_asyncio import AsyncIOMotorClient


def get_connection():
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    metadata_db_name = os.getenv("METADATA_DB_NAME")
    client = MongoClient(database_url)
    db = client[metadata_db_name]
    return client, db

async def get_async_connection():
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    metadata_db_name = os.getenv("METADATA_DB_NAME")

    client = AsyncIOMotorClient(database_url)
    db = client[metadata_db_name]
    return client, db

def get_sch_db_name(document):
    region = document["region"]
    return region.strip().replace(" ", "_").lower() + "__" + "schedule"

def ini_db():
    client, db = get_connection()
    transit_systems_collection = os.getenv("METADATA_COLLECTION_NAME")
    ts_cursor = db[transit_systems_collection]

    for document in ts_cursor.find({}):
        n_db_name = get_sch_db_name(document)
        if n_db_name not in client.list_database_names():
            n_db = client[n_db_name]
            dummy_collection = n_db["NA"]
            dummy_collection.insert_one({"NA": "NA"})
    client.close()

def delete_added_schedules():
    client, db = get_connection()
    transit_systems_collection = os.getenv("METADATA_COLLECTION_NAME")
    ts_cursor = db[transit_systems_collection]
    for document in ts_cursor.find({}):
        n_db_name = get_sch_db_name(document)
        client.drop_database(n_db_name)

if __name__ == "__main__":
    os.makedirs("schedules/zips", exist_ok=True)
    delete_added_schedules()
    ini_db()