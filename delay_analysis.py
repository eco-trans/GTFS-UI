import numpy as np
import pandas as pd
import time
import pytz
import multiprocessing

from initialize_db import get_connection
from types import SimpleNamespace

def get_schedule(location):
    client, _ = get_connection()
    sc_db = client[f"{location}__schedule"]

    data = dict()
    data["location"] = location

    for i in sc_db.list_collections():
        if i["name"] == "NA":
            continue

        df = pd.DataFrame(sc_db[i["name"]].find({})).assign(
            sc_upload_time=int(i["name"].split("___")[0])
        )
        if "trip_id" in df:
            df = df.astype({"trip_id": "str"})

        if i["name"].split("___")[-1] in data.keys():
            df = pd.concat([df, data[i["name"].split("___")[-1]]], axis=0)

        data[i["name"].split("___")[-1]] = df

    data["stop_times"] = data["stop_times"].set_index(
        ["sc_upload_time", "trip_id"], drop=True
    ).sort_index()

    data["trips"] = data["trips"].set_index(
        ["sc_upload_time", "trip_id"], drop=True
    ).sort_index()

    data["calendar_dates"] = data["calendar_dates"].set_index(
        ["sc_upload_time", "service_id"], drop=True
    ).sort_index()

    dates = (
        data["calendar_dates"].loc[:, "date"]
        .map(str)
        .map(lambda x: pd.to_datetime(f"{x[0:4]}-{x[4:6]}-{x[6:8]}"))
    )
    data["calendar_dates"].drop("date", axis=1, inplace=True)
    data["calendar_dates"]["date"] = dates

    data["calendar"] = data["calendar"].set_index(
        ["sc_upload_time", "service_id"], drop=True
    ).sort_index()

    dates = (
        data["calendar"].loc[:, "end_date"]
        .map(str)
        .map(lambda x: pd.to_datetime(f"{x[0:4]}-{x[4:6]}-{x[6:8]}"))
    )
    data["calendar"].drop("end_date", axis=1, inplace=True)
    data["calendar"]["end_date"] = dates

    dates = (
        data["calendar"].loc[:, "start_date"]
        .map(str)
        .map(lambda x: pd.to_datetime(f"{x[0:4]}-{x[4:6]}-{x[6:8]}"))
    )

    data["calendar"].drop("start_date", axis=1, inplace=True)
    data["calendar"]["start_date"] = dates

    client.close()

    return SimpleNamespace(**data)

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
    x = x.loc[
        :, ~x.map(lambda x: np.nan if x == "NONE" else x).isnull().all(axis=0)
    ]

    aatp = {}
    for date in dates:
        x_day = x.loc[x.date == date]
        stop_seqs = x_day.loc[:, x_day.columns.str.contains("__stop_sequence")]

        for i in range(stop_seqs.shape[1]):
            s = stop_seqs[f"stop_time_update_{i}__stop_sequence"]
            pair = s.iloc[::-1].drop_duplicates(keep="first").to_dict()
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

    aat = pd.DataFrame(aat)

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

def calulate_delay(schedule_data, trip_id, trip_updates, sc_time):
    estimated_arrivals = (
        schedule_data.stop_times.loc[(sc_time, trip_id), ["stop_sequence", "arrival_time"]]
        .rename(columns={"arrival_time": "scheduled_arrival_time"})
        .reset_index(drop=True)
    )

    actual_arrivals = actual_arrivals_for_trip(trip_updates)

    if actual_arrivals is None:
        return None

    if "delay" in ",".join(actual_arrivals.columns.tolist()):  # Portland case
        merged_arrivals = (
            actual_arrivals.merge(
                estimated_arrivals, how="outer", on="stop_sequence"
            )
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
            merged_arrivals["date"] + " " + merged_arrivals["actual_arrival_time"]
        )
        merged_arrivals["actual_arrival_time_unix"] = merged_arrivals.apply(
            lambda row: pytz.timezone(
                schedule_data.agency.loc[schedule_data.agency.sc_upload_time == sc_time]
                .agency_timezone.unique()
                .item()
            ).localize(row["actual_arrival_time_unix"]),
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
                    schedule_data.agency.loc[schedule_data.agency.sc_upload_time == sc_time]
                    .agency_timezone.unique()
                    .item()
                )
            )
        except:
            raise Exception("The system is spanned over multiple timeszones")

        merged_arrivals = (
            actual_arrivals.merge(
                estimated_arrivals, how="outer", on="stop_sequence"
            )
            .dropna()
            .reset_index(drop=True)
        )

        merged_arrivals = merged_arrivals.assign(
            actual_arrival_time=lambda x: x.actual_arrival_time.dt.time.astype(
                "str"
            )
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
    schedule_data, dated_collection_name, field_name = arg
    client, _ = get_connection()
    rt_db = client[f"{schedule_data.location}__trip_updates"]
    rt_delay_db = client[f"{schedule_data.location}__delay"]

    rt_db[dated_collection_name].create_index([("trip__trip_id", 1)])
    completed_trips = dict()

    for sc_time in sorted(schedule_data.stop_times.index.get_level_values(0).unique()):
        stop_times = schedule_data.stop_times.loc[sc_time]

        scheduled_trip_ids = stop_times.index.unique()

        for trip_id in scheduled_trip_ids:

            str_trip_id = str(trip_id)

            trip_updates = pd.DataFrame(
                rt_db[dated_collection_name].find({field_name: str_trip_id})
            ).rename(columns={field_name: "trip__trip_id"})

            if trip_updates.shape[0] > 0:
                service_id = schedule_data.trips.loc[(sc_time, trip_id), "service_id"]

                try:
                    service_id = service_id.item()
                except:
                    pass

                if completed_trips.get((trip_id, service_id)) is not None:
                    continue

                if service_id not in schedule_data.calendar.index.get_level_values(
                    1
                ) and service_id not in schedule_data.calendar_dates.index.get_level_values(
                    1
                ):
                    continue

                trip_updates = trip_updates.assign(
                    time=lambda x: x._id.map(
                        lambda y: y.generation_time.timestamp()
                    ).astype("int")
                ).assign(
                    date=lambda x: x.time.astype("datetime64[s]").dt.strftime(
                        "%Y-%m-%d"
                    )
                )

                try:
                    min_date = schedule_data.calendar.loc[
                        (sc_time, service_id), "start_date"
                    ]
                except:
                    min_date = schedule_data.calendar_dates.loc[
                        (sc_time, service_id), "date"
                    ].min()

                try:
                    min_date = min_date.item()
                except:
                    pass

                try:
                    max_date = schedule_data.calendar.loc[(sc_time, service_id), "end_date"]
                except:
                    max_date = schedule_data.calendar_dates.loc[
                        (sc_time, service_id), "date"
                    ].max()

                try:
                    max_date = max_date.item()
                except:
                    pass

                min_mask = (
                    min_date - pd.to_datetime(trip_updates.loc[:, "date"])
                ).map(lambda x: x.total_seconds()) <= 0

                max_mask = (
                    max_date - pd.to_datetime(trip_updates.loc[:, "date"])
                ).map(lambda x: x.total_seconds()) >= 0

                mask = min_mask & max_mask

                trip_updates = trip_updates.loc[mask]

                if trip_updates.shape[0] > 0:
                    try:
                        merged_arrivals = calulate_delay(
                            schedule_data, str_trip_id, trip_updates, sc_time
                        )
                    except:
                        continue

                    if merged_arrivals is None:
                        continue
                    else:
                        completed_trips[(trip_id, service_id)] = True
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
                                    "trip_id": str_trip_id,
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

    cities = (
        "Portland,Atlanta,Salt Lake City,San Francisco,New York City,Los Angeles".lower()
        .replace(" ", "_")
        .split(",")
    )

    for city in cities:
        print(f"starting for {city}")
        schedule_data = get_schedule(city)
        client, _ = get_connection()

        # total_deleted_count = clear_all_collections(
        #     client, f"{schedule_data.location}__delay"
        # )
        # print("Deleted previous records: ", total_deleted_count)

        rt_db = client[f"{schedule_data.location}__trip_updates"]
        rt_delay_db = client[f"{schedule_data.location}__delay"]

        # for delay_collection in rt_delay_db.list_collection_names():
        #     rt_delay_db[delay_collection].drop()

        field_name = "trip__trip_id"
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
        with multiprocessing.Pool(processes=1) as pool:
            res = pool.map(process_date, [[schedule_data, proc_date, field_name] for proc_date in all_dates])
        