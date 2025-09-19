import os
import time
from glob import glob
import shutil

import aiohttp
import zipfile
import pandas as pd
import asyncio
from tqdm.asyncio import tqdm_asyncio
import hashlib
import gtfs_realtime_pb2

from initialize_db import get_async_connection, get_sch_db_name, get_rt_db_name
from google.protobuf.json_format import MessageToDict


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
                schedule_urls[(_id, None)] = data.format(transit_system["api_key"], transit_system["agency"])

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


def flatten_dict(data, parent_key='', sep='__'):
    items = []
    if isinstance(data, dict):
        for k, v in data.items():
            new_key = f"{parent_key}{sep}{k}" if parent_key else k
            items.extend(flatten_dict(v, new_key, sep=sep).items())
    elif isinstance(data, list):
        for i, v in enumerate(data, 0):
            new_key = f"{parent_key}_{i}"
            items.extend(flatten_dict(v, new_key, sep=sep).items())
    else:
        items.append((parent_key, data))
    return dict(items)

async def fetch_rt_feed(url, headers, session):
    async with session.get(url, headers=headers) as response:
        if response.status != 200:
            print(url, headers)
            raise RuntimeError(f"Bad status {response.status}: {await response.text()}")
        return await response.read()

async def stream_rt_data():
    client, db = await get_async_connection()
    ts_name = os.getenv("METADATA_COLLECTION_NAME")  # ts stands for transit systems
    ts_cursor = db[ts_name]

    responses = []
    id_var_pairs = []
    async with aiohttp.ClientSession() as session:
        async for transit_system in ts_cursor.find({}):
            _id = get_rt_db_name(transit_system)
            data = transit_system.get("realtime")
            is_key_needed = transit_system.get("rt_needs_key")
            is_oid_needed = transit_system.get("rt_needs_oid")

            api_key = transit_system.get("api_key")
            agency = transit_system.get("agency")

            for var_name, link in data.items():
                if len(link) == 0:
                    continue

                if is_key_needed and is_oid_needed:
                    url = link.format(api_key, agency)

                elif is_key_needed:
                    url = link.format(api_key)

                elif is_oid_needed:
                    url = link.format(agency)
                else:
                    url = link

                if api_key is not None:
                    headers = {
                        'Authorization': api_key,
                    }
                else:
                    headers = None
                
                try:
                    response = fetch_rt_feed(url, headers, session)
                    responses.append(response)
                    id_var_pairs.append((_id, var_name))
                except:
                    continue
        
        responses = await asyncio.gather(*responses) # required session context 

    for (_id, var_name), response in zip(id_var_pairs, responses):
        feed = gtfs_realtime_pb2.FeedMessage()
        feed.ParseFromString(response)
        dict_feed = MessageToDict(feed, preserving_proto_field_name=True)
        
        entities = dict_feed["entity"]
        for e in entities:
            n_entity = {}
            for k, v in e.items():
                if isinstance(v, dict):
                    n_entity.update(flatten_dict(v))
                else:
                    n_entity[str(k)+"__muk"] = v

            n_db = client[_id]
            collection = n_db[var_name]
            collection.insert_one(n_entity)

if __name__ == "__main__":
    asyncio.run(update_schedules())
    asyncio.run(stream_rt_data())

