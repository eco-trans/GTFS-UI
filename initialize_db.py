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

def get_rt_db_name(document):
    region = document["region"]
    return region.strip().replace(" ", "_").lower() + "__" + "realtime"

def ini_db():
    client, db = get_connection()
    transit_systems_collection = os.getenv("METADATA_COLLECTION_NAME")
    ts_cursor = db[transit_systems_collection]

    for document in ts_cursor.find({}):
        for n_db_name in [get_sch_db_name(document), get_rt_db_name(document)]:
            if n_db_name not in client.list_database_names():
                n_db = client[n_db_name]
                dummy_collection = n_db["NA"]
                dummy_collection.insert_one({"NA": "NA"})

    client.close()

def remove_ts_prec_frorm_collections():
    client, db = get_connection()
    transit_systems_collection = os.getenv("METADATA_COLLECTION_NAME")
    ts_cursor = db[transit_systems_collection]

    for document in ts_cursor.find({}):
        for n_db_name in [get_sch_db_name(document)]:
            n_db = client[n_db_name]
            for collection_name in n_db.list_collection_names():
                collection = n_db[collection_name]
                if "." in collection_name:
                    name_parts = list(collection_name.split("__"))
                    name_parts[0] = name_parts[0].split(".")[0]
                    print(collection_name, ">>", "__".join(name_parts))
                    collection.rename("__".join(name_parts), dropTarget=False) 
                    
    client.close()

def delete_added_dbs():
    client, db = get_connection()
    transit_systems_collection = os.getenv("METADATA_COLLECTION_NAME")
    ts_cursor = db[transit_systems_collection]
    for document in ts_cursor.find({}):
        for n_db_name in [get_sch_db_name(document), get_rt_db_name(document)]:
            client.drop_database(n_db_name)

if __name__ == "__main__":
    # os.makedirs("schedules/zips", exist_ok=True)
    # os.makedirs("schedules/temps", exist_ok=True)
    # delete_added_dbs()
    # ini_db()
    remove_ts_prec_frorm_collections()