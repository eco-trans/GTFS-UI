import os
from glob import glob
import shutil
import json

import requests
import zipfile
from pymongo import MongoClient
from dotenv import load_dotenv


def get_connection():
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    db_name = os.getenv("DB_NAME")
    client = MongoClient(database_url)
    db = client[db_name]
    return client, db

def get_schedules():
    client, db = get_connection()
    ts_name = os.getenv("COLLECTION_1_NAME") #ts stands for transit systems
    ts_cursor = db[ts_name]

    schedule_urls = {}
    for transit_system in ts_cursor.find({}):
        _id = transit_system["_id"]
        data = transit_system["schedule"]

        if "schedule_needs_key" not in transit_system:
            transit_system["schedule_needs_key"] = False

        if "schedule_needs_oid" not in transit_system:
            transit_system["schedule_needs_oid"] = False

        if data == "" or data is None:
            continue

        if not isinstance(data, str):
            for key, link in data.items():
                if not transit_system["schedule_needs_key"] and not transit_system["schedule_needs_oid"]:
                    schedule_urls[(_id, key)] = link
                elif not transit_system["schedule_needs_oid"]:
                    schedule_urls[(_id, key)] = link.format(transit_system["api_key"])
                else:
                    raise NotImplemented
        else:
            if not transit_system["schedule_needs_key"] and not transit_system["schedule_needs_oid"]:
                schedule_urls[(_id, None)] = data
            elif not transit_system["schedule_needs_oid"]:
                schedule_urls[(_id, None)] = data.format(transit_system["api_key"])
            else:
                operator_endpoint = transit_system["operators_endpoints"]
                if "={}" in operator_endpoint:
                    operator_endpoint = operator_endpoint.format(transit_system["api_key"])
                
                response = requests.get(operator_endpoint)
                try:
                    json_respose = response.json()
                except:
                    content_decoded = response.content.decode('utf-8-sig')
                    json_respose = json.loads(content_decoded)
                    # print([i["Id"] for i in json_respose])

                # schedule_urls[(_id, key)] = data.format(transit_system["api_key"], )
                # WAITING FOR THE RESPONCE FROM 511

            for (_id, operator), link in schedule_urls.items():
                response = requests.get(link)
                with open(os.path.join("schedules", "zips", f"{_id}___{operator}.zip"), 'wb') as f:
                    f.write(response.content)
    client.close()

def extract_schedule():
    zip_paths = glob(os.path.join("schedules", "zips", "*.zip"))
    for path in zip_paths:
        name = path.split(os.path.sep)[-1].split(".")[0]
        dir_path = os.path.join("schedules", name)
        if os.path.isdir(dir_path):
            shutil.rmtree('dir_path')
        os.makedirs(dir_path, exist_ok=True)
        
        try:
            with zipfile.ZipFile(path, 'r') as zip_ref:
                zip_ref.extractall(dir_path)
        except:
            print("Name: ", name, " is corrupted")


def push_schedules():
    pass


if __name__ == "__main__":
    # get_schedules()
    extract_schedule()