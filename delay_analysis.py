import multiprocessing
import os

import numpy as np
import pandas as pd
import time
import pytz
from tqdm import tqdm

from initialize_db import get_connection


def actual_arrivals_for_trip(trip_updates):
    x = trip_updates

    if "trip__schedule_relationship" in x.columns:
        mask = x.trip__schedule_relationship == "CANCELED"
        x = x.loc[~mask]
        if x.shape[0] == 0:
            return None

    dates = x.date.unique()
    stops = np.unique(
        x.loc[:, x.columns.str.contains("__stop_sequence")].values.flatten()
    )
    stops = stops[~np.isnan(stops)]
    x = x.loc[:, ~x.map(lambda x: np.nan if x == "NONE" else x).isnull().all(axis=0)]
    aatp = {}
    for date in dates:
        x_day = x.loc[x.date == date]
        stop_seqs = x_day.loc[:, x_day.columns.str.contains("__stop_sequence")]
        for i in [
            int(j.split("__")[0].split("_")[-1]) for j in stop_seqs.columns
        ]:  # stop time update
            s = stop_seqs[f"stop_time_update_{i}__stop_sequence"]
            pair = (
                s.iloc[::-1].drop_duplicates(keep="first").to_dict()
            )  # picking last value of the ith update for each stop seq in that update
            pair = {v: k for k, v in pair.items()}
            for k in pair.keys():
                if (
                    f"stop_time_update_{i}__schedule_relationship" in x_day.columns
                    and x_day.loc[
                        pair[k], f"stop_time_update_{i}__schedule_relationship"
                    ]
                    == "SKIPPED"
                ):
                    continue
                if (k, date) not in aatp.keys() and not np.isnan(k):
                    aatp[(k, date)] = (
                        pair[k],
                        i,
                        x_day.loc[pair[k], "time"].item(),
                    )

    aatp = pd.DataFrame(aatp).T.reset_index()
    aatp = aatp.rename(
        columns={
            k: v
            for k, v in zip(
                aatp.columns, ["stop_sequence", "date", "ind", "col", "time"]
            )
        }
    )

    aat = []
    for row in aatp.itertuples():
        try:
            aat.append(
                {
                    "stop_sequence": row.stop_sequence,
                    "time": row.time,
                    "date": row.date,
                    "actual_arrival_time": x.loc[
                        row.ind, f"stop_time_update_{row.col}__arrival__time"
                    ].item(),
                }
            )
        except:
            try:
                aat.append(
                    {
                        "stop_sequence": row.stop_sequence,
                        "time": row.time,
                        "date": row.date,
                        "actual_arrival_time": x.loc[
                            row.ind, f"stop_time_update_{row.col}__departure__time"
                        ].item(),
                    }
                )
            except:
                try:
                    aat.append(
                        {
                            "stop_sequence": row.stop_sequence,
                            "time": row.time,
                            "date": row.date,
                            "actual_arrival_delay": x.loc[
                                row.ind, f"stop_time_update_{row.col}__arrival__delay"
                            ].item(),
                        }
                    )
                except:
                    continue

    aat = pd.DataFrame(aat).dropna()

    if aat.shape[0] == 0:
        return None

    try:
        aat["actual_arrival_time_unix"] = aat["actual_arrival_time"]
        aat = (
            aat.sort_values("stop_sequence", ignore_index=True)
            .astype({"actual_arrival_time": "datetime64[s]"})
            .assign(
                actual_arrival_time=lambda x: x.actual_arrival_time.dt.tz_localize(
                    "UTC"
                )
            )
        )
    except:
        aat = aat.sort_values("stop_sequence", ignore_index=True).astype(
            {"actual_arrival_delay": "int"}
        )

    return aat


def calulate_delay(generators, trip_id, trip_updates, sc_time):
    generator_key_index = None
    for idx, stop_times in enumerate(generators[sc_time]["stop_times"]):
        stop_times.create_index([("trip_id", 1)])
        estimated_arrivals = pd.DataFrame(stop_times.find({"trip_id": trip_id}))
        if estimated_arrivals.shape[0] > 0:
            generator_key_index = idx
            break
        else:
            try:
                estimated_arrivals = pd.DataFrame(
                    stop_times.find({"trip_id": int(trip_id)})
                )
                if estimated_arrivals.shape[0] > 0:
                    generator_key_index = idx
                    break
            except:
                continue

    if estimated_arrivals is None:
        raise Exception("trip not found in schedule")

    if estimated_arrivals.shape[0] == 0:
        raise Exception("trip not found in schedule")

    estimated_arrivals = (
        estimated_arrivals[["stop_sequence", "arrival_time"]]
        .rename(columns={"arrival_time": "scheduled_arrival_time"})
        .reset_index(drop=True)
    )
    actual_arrivals = actual_arrivals_for_trip(trip_updates)

    if actual_arrivals is None:
        return None

    agency = generators[sc_time]["agency"][generator_key_index]
    agency_timezone = list(agency.find({}))[0]
    agency_timezone = agency_timezone["agency_timezone"]

    if "delay" in ",".join(actual_arrivals.columns.tolist()):  # Portland case
        merged_arrivals = (
            actual_arrivals.merge(estimated_arrivals, how="outer", on="stop_sequence")
            .dropna()
            .reset_index(drop=True)
        )

        eta = pd.to_timedelta(merged_arrivals["scheduled_arrival_time"])
        merged_arrivals["actual_arrival_delay"] = eta + pd.to_timedelta(
            merged_arrivals["actual_arrival_delay"], unit="s"
        )
        merged_arrivals["actual_arrival_time"] = (
            merged_arrivals["actual_arrival_delay"].astype(str).str.split().str[-1]
        )

        merged_arrivals["actual_arrival_time_unix"] = pd.to_datetime(
            merged_arrivals["date"] + " " + merged_arrivals["actual_arrival_time"], yearfirst=True
        )

        merged_arrivals["actual_arrival_time_unix"] = merged_arrivals.apply(
            lambda row: pytz.timezone(agency_timezone).localize(
                row["actual_arrival_time_unix"]
            ),
            axis=1,
        )

        merged_arrivals["actual_arrival_time_unix"] = (
            merged_arrivals["actual_arrival_time_unix"].astype("int64") // 10**9
        )

        merged_arrivals.drop("actual_arrival_delay", axis=1, inplace=True)

    else:
        try:
            actual_arrivals = actual_arrivals.assign(
                actual_arrival_time=lambda x: x.actual_arrival_time.dt.tz_convert(
                    agency_timezone
                )
            )
        except:
            raise Exception("The system is spanned over multiple timeszones")

        merged_arrivals = (
            actual_arrivals.merge(estimated_arrivals, how="outer", on="stop_sequence")
            .dropna()
            .reset_index(drop=True)
        )

        merged_arrivals = merged_arrivals.assign(
            actual_arrival_time=lambda x: x.actual_arrival_time.dt.time.astype("str")
        )

    merged_arrivals = merged_arrivals.assign(
        actual_arrival_time=lambda x: x.actual_arrival_time.map(pd.Timedelta)
    ).assign(
        scheduled_arrival_time=lambda x: x.scheduled_arrival_time.map(pd.Timedelta)
    )

    days_to_remove = merged_arrivals.scheduled_arrival_time.dt.days
    days_only_td = days_to_remove.map(lambda x: pd.Timedelta(days=x))
    merged_arrivals.loc[:, "scheduled_arrival_time"] -= days_only_td

    return merged_arrivals


def clear_all_collections(client, db_name):
    db = client[db_name]
    collection_names = db.list_collection_names()
    total_deleted_count = 0

    for collection_name in collection_names:
        collection = db[collection_name]
        result = collection.delete_many({})
        total_deleted_count += result.deleted_count
        collection.drop()

    return total_deleted_count


def process_date(arg):
    location, dated_collection_name = arg

    int_date = int("".join(dated_collection_name.split("-")))
    client, _ = get_connection()
    sc_db = client[f"{location}__schedule"]

    generators = {}
    for i in sc_db.list_collections():
        if i["name"] == "NA":
            continue

        generator = sc_db[
            i["name"]
        ]  # make sure to convert trip_id to str if present in the resulting df
        sc_upload_time = int(i["name"].split("___")[0])
        sch_type = i["name"].split("___")[-1]

        if sc_upload_time not in generators:
            generators[sc_upload_time] = {}

        if sch_type not in generators[sc_upload_time]:
            generators[sc_upload_time][sch_type] = []

        generators[sc_upload_time][sch_type].append(generator)

    rt_db = client[f"{location}__trip_updates"]
    rt_db[dated_collection_name].create_index([("trip__trip_id", 1)])
    rt_delay_db = client[f"{location}__delay"]

    for trip_id in rt_db[dated_collection_name].distinct("trip__trip_id"):
        actual_sc_time = None
        for sc_time in generators.keys():
            for trips in generators[sc_time]["trips"]:
                trips.create_index([("trip_id", 1)])
                trip = trips.find_one({"trip_id": trip_id})
                if trip:
                    break
                else:
                    try:
                        trip = trips.find_one({"trip_id": int(trip_id)})
                        if trip:
                            break
                    except:
                        continue

            if trip:
                service_id = trip["service_id"]
                for calendar in generators[sc_time]["calendar"]:
                    calendar.create_index([("service_id", 1)])
                    calendar_doc = calendar.find_one({"service_id": service_id})
                    if calendar_doc:
                        start, end = (
                            calendar_doc["start_date"],
                            calendar_doc["end_date"],
                        )
                        if start <= int_date <= end:
                            actual_sc_time = sc_time
                            break

                if calendar_doc is None:
                    for calendar in generators[sc_time]["calendar_dates"]:
                        calendar.create_index([("service_id", 1)])
                        calendar_doc = pd.DataFrame(
                            calendar.find({"service_id": service_id})
                        )
                        if calendar_doc.shape[0] > 0:
                            start, end = (
                                calendar_doc["date"].min(),
                                calendar_doc["date"].max(),
                            )
                            if start <= int_date <= end:
                                actual_sc_time = sc_time
                                break

            if actual_sc_time:
                break

        trip_updates = (
            pd.DataFrame(rt_db[dated_collection_name].find({"trip__trip_id": trip_id}))
            .assign(
                time=lambda x: x._id.map(
                    lambda y: y.generation_time.timestamp()
                ).astype("int")
            )
            .assign(
                date=lambda x: x.time.astype("datetime64[s]").dt.strftime("%Y-%m-%d")
            )
        )

        try:
            merged_arrivals = calulate_delay(generators, trip_id, trip_updates, sc_time)
        except:
            continue

        if merged_arrivals is None:
            continue

        data = merged_arrivals.assign(
            delay__sc_minus_ac=lambda x: (
                x.scheduled_arrival_time - x.actual_arrival_time
            ).dt.total_seconds()
        )

        for date_frame in data.groupby("date"):

            frame = date_frame[1]
            if frame["date"].unique().shape[0] > 1:
                raise Exception("More than one date in a group")
            collection = rt_delay_db[dated_collection_name]
            collection.insert_one(
                {
                    "trip_id": trip_id,
                    "sc_time": sc_time,
                    "data": frame[
                        "stop_sequence,time,actual_arrival_time_unix,delay__sc_minus_ac".split(
                            ","
                        )
                    ].values.tolist(),
                }
            )

    client.close()


if __name__ == "__main__":
    client, db = get_connection()
    collection = db[os.getenv("METADATA_COLLECTION_NAME")]
    cities = [
        i.lower().replace(" ", "_")
        for i in pd.DataFrame(collection.find({}))["region"].values.tolist()
    ]
    client.close()

    for city in cities:
        print(f"starting for {city}")
        client, _ = get_connection()

        rt_db = client[f"{city}__trip_updates"]
        rt_delay_db = client[f"{city}__delay"]

        all_dates = []

        for dated_collection_name in sorted(rt_db.list_collection_names())[::-1]:
            if (
                dated_collection_name == "NA"
                or dated_collection_name in rt_delay_db.list_collection_names()
                or dated_collection_name
                in [
                    pd.to_datetime(time.time(), unit="s").strftime("%Y-%m-%d"),
                    pd.to_datetime(time.time() - 24 * 3600, unit="s").strftime(
                        "%Y-%m-%d"
                    ),
                ]
            ):
                continue

            all_dates.append(dated_collection_name)

        client.close()

        print(f"{len(all_dates)=}")

        # if city == "austin":
        #     for proc_date in tqdm(all_dates):
        #         process_date([city, proc_date])

        with multiprocessing.Pool(processes=5) as pool:
            res = pool.map(
                process_date,
                [[city, proc_date] for proc_date in all_dates],
            )
