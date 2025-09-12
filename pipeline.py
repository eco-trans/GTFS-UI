import os
import time
from glob import glob
import shutil
import json

import aiohttp
import zipfile
import pandas as pd
import asyncio
from tqdm.asyncio import tqdm_asyncio
import hashlib

from initialize_db import get_async_connection, get_sch_db_name


async def get_schedules():
    client, db = await get_async_connection()
    ts_name = os.getenv("METADATA_COLLECTION_NAME")  # ts stands for transit systems
    ts_cursor = db[ts_name]

    schedule_urls = {}

    async for transit_system in ts_cursor.find({}):
        _id = get_sch_db_name(transit_system)  # transit_system["_id"]
        data = transit_system.get("schedule")

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

                async with aiohttp.ClientSession() as session:
                    async with session.get(operator_endpoint) as response:
                        try:
                            json_respose = await response.json()
                        except:
                            content_decoded = await response.text(encoding="utf-8-sig")
                            json_respose = json.loads(content_decoded)
                            # print([i["Id"] for i in json_respose])

                # schedule_urls[(_id, key)] = data.format(transit_system["api_key"], )
                # WAITING FOR THE RESPONCE FROM 511

    async with aiohttp.ClientSession() as session:
        tasks = []
        for (_id, operator), link in schedule_urls.items():
            tasks.append(download_zip(session, _id, operator, link))

        await asyncio.gather(*tasks)
    client.close()
    return schedule_urls


async def download_zip(session, _id, operator, link):
    async with session.get(link) as response:
        content = await response.read()
        filepath = os.path.join("schedules", "temps", f"{_id}___{operator}.zip")
        await asyncio.to_thread(write_file, filepath, content)

def write_file(filepath, content):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, "wb") as f:
        f.write(content)

def extract_schedule():
    zip_paths = glob(os.path.join("schedules", "zips", "*.zip"))
    for path in zip_paths:
        name = path.split(os.path.sep)[-1].split(".")[0]
        dir_path = os.path.join("schedules", name)
        if os.path.isdir(dir_path):
            shutil.rmtree(dir_path)
        os.makedirs(dir_path, exist_ok=True)
        
        try:
            with zipfile.ZipFile(path, 'r') as zip_ref:
                zip_ref.extractall(dir_path)
        except:
            print("Name: ", name, " is corrupted")

async def insert_frame(db, collection_name, frame: pd.DataFrame):
    docs = frame.to_dict("records")
    if docs:
        await db[collection_name].insert_many(docs)

async def process_file(path, text_file, db, operator, schedule_vars, timestamp):
    var_name = os.path.splitext(text_file)[0]
    if var_name not in schedule_vars:
        return

    frame = await asyncio.to_thread(
        pd.read_csv, os.path.join(path, text_file)
    )

    collection_name = f"{timestamp}___{operator}___{var_name}"
    await insert_frame(db, collection_name, frame)

async def push_schedules():
    timestamp = time.time()
    client, db = await get_async_connection()
    schedule_vars = os.getenv("SCHEDULE_VARS").split(",")

    paths = glob(os.path.join("schedules", "*/"))
    tasks = []

    for path in paths:
        if "zips" in path:
            continue

        db_name = os.path.basename(path.strip(os.path.sep)).split("___")[0]
        operator = os.path.basename(path.strip(os.path.sep)).split("___")[-1]
        db = client[db_name]

        for text_file in os.listdir(path):
            tasks.append(
                process_file(path, text_file, db, operator, schedule_vars, timestamp)
            )

    for f in tqdm_asyncio.as_completed(tasks):
        await f

    client.close()

def get_sha256_hash(file_path):
    sha256_hash = hashlib.sha256()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            sha256_hash.update(byte_block)
    return sha256_hash.hexdigest()

def check_if_updated(_id, operator):
    temp_filepath = os.path.join("schedules", "temps", f"{_id}___{operator}.zip")
    prev_filepath = os.path.join("schedules", "zips", f"{_id}___{operator}.zip")
    if not os.path.isfile(prev_filepath):
        os.rename(temp_filepath, prev_filepath)
        return True
    else:
        if get_sha256_hash(temp_filepath) == get_sha256_hash(prev_filepath):
            os.remove(temp_filepath)
            return False
        else:
            os.remove(prev_filepath)
            os.rename(temp_filepath, prev_filepath)
            return True

async def update_schedules():
    start = time.time()
    schedule_urls = await get_schedules()
    print(f"----- Schedules downloaded in {(time.time()-start)/60. :.4f} minutes -----")

    for (_id, operator), _ in schedule_urls.items():
        is_updated = check_if_updated(_id, operator)
        print(f"Is {_id}___{operator} updated: ", is_updated)

        if is_updated:
            start = time.time()
            extract_schedule()
            print(f"----- Schedules extracted in {(time.time()-start)/60. :.4f} minutes -----")
            start = time.time()
            await push_schedules()
            print(f"----- Schedules updated in {(time.time()-start)/60. :4f} minutes -----")


if __name__ == "__main__":
    asyncio.run(update_schedules())