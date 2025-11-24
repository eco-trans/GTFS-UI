import numpy as np
import pandas as pd

# from tqdm import tqdm
from initialize_db import get_connection


def tqdm(obj, **kwrags):
    return obj


class GTFS:
    def __init__(self, location) -> None:
        self.location = location
        client, _ = get_connection()
        self.sc_db = client[f"{location}__schedule"]

        for i in self.sc_db.list_collections():
            if i["name"] == "NA":
                continue
            # print(i["name"])

            df = pd.DataFrame(self.sc_db[i["name"]].find({})).assign(
                sc_upload_time=int(i["name"].split("___")[0])
            )
            if "trip_id" in df:
                df = df.astype({"trip_id": "str"})

            if hasattr(self, i["name"].split("___")[-1]):
                df = pd.concat([df, getattr(self, i["name"].split("___")[-1])], axis=0)

            setattr(
                self,
                i["name"].split("___")[-1],
                df,
            )

        self.stop_times = self.stop_times.set_index(
            ["sc_upload_time", "trip_id"], drop=True
        ).sort_index()

        self.trips = self.trips.set_index(
            ["sc_upload_time", "trip_id"], drop=True
        ).sort_index()

        self.calendar_dates = self.calendar_dates.set_index(
            ["sc_upload_time", "service_id"], drop=True
        ).sort_index()

        dates = (
            self.calendar_dates.loc[:, "date"]
            .map(str)
            .map(lambda x: pd.to_datetime(f"{x[0:4]}-{x[4:6]}-{x[6:8]}"))
        )
        self.calendar_dates.drop("date", axis=1, inplace=True)
        self.calendar_dates["date"] = dates

        self.calendar = self.calendar.set_index(
            ["sc_upload_time", "service_id"], drop=True
        ).sort_index()

        dates = (
            self.calendar.loc[:, "end_date"]
            .map(str)
            .map(lambda x: pd.to_datetime(f"{x[0:4]}-{x[4:6]}-{x[6:8]}"))
        )
        self.calendar.drop("end_date", axis=1, inplace=True)
        self.calendar["end_date"] = dates

        dates = (
            self.calendar.loc[:, "start_date"]
            .map(str)
            .map(lambda x: pd.to_datetime(f"{x[0:4]}-{x[4:6]}-{x[6:8]}"))
        )

        self.calendar.drop("start_date", axis=1, inplace=True)
        self.calendar["start_date"] = dates

        client.close()

    def actual_arrivals_for_trip(self, trip_updates):
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
                        aatp[(k, date)] = (pair[k], i, x_day.loc[pair[k], "time"].item())

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

        aat = pd.DataFrame(aat)

        if aat.shape[0] == 0:
            return None

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

        return aat

    def calulate_delay(self, trip_id, trip_updates, sc_time):
        estimated_arrivals = (
            self.stop_times.loc[(sc_time, trip_id), ["stop_sequence", "arrival_time"]]
            .rename(columns={"arrival_time": "scheduled_arrival_time"})
            .reset_index(drop=True)
        )

        actual_arrivals = self.actual_arrivals_for_trip(trip_updates)

        if actual_arrivals is None:
            return None

        try:
            actual_arrivals = actual_arrivals.assign(
                actual_arrival_time=lambda x: x.actual_arrival_time.dt.tz_convert(
                    self.agency.loc[self.agency.sc_upload_time == sc_time]
                    .agency_timezone.unique()
                    .item()
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
            actual_arrival_time=lambda x: x.actual_arrival_time.dt.time.astype(
                "str"
            ).map(pd.Timedelta)
        ).assign(
            scheduled_arrival_time=lambda x: x.scheduled_arrival_time.map(pd.Timedelta)
        )

        days_to_remove = merged_arrivals.scheduled_arrival_time.dt.days
        days_only_td = days_to_remove.map(lambda x: pd.Timedelta(days=x))
        merged_arrivals.loc[:, "scheduled_arrival_time"] -= days_only_td

        return merged_arrivals

    
    def clear_all_collections(self, client, db_name):
        db = client[db_name]
        collection_names = db.list_collection_names()
        total_deleted_count = 0
        
        for collection_name in collection_names:
            collection = db[collection_name]
            result = collection.delete_many({})
            total_deleted_count += result.deleted_count
            collection.drop()

        return total_deleted_count

    def run_delay_analyzer(self):
        client, _ = get_connection()

        total_deleted_count = self.clear_all_collections(client, f"{self.location}__delay")
        print("Deleted previous records: ", total_deleted_count)

        rt_db = client[f"{self.location}__realtime"]
        rt_delay_db = client[f"{self.location}__delay"]

        # try:
        #     rt_db["delay"].drop()
        # except:
        #     pass

        # field_name = (
        #     "trip__trip_id"
        #     if pd.DataFrame(rt_db["trip_updates"].find().limit(100))
        #     .columns.str.contains("trip__trip_id")
        #     .any()
        #     else "id__muk"
        # )

        field_name = "trip__trip_id"

        completed_trips = dict()

        for sc_time in tqdm(
            sorted(self.stop_times.index.get_level_values(0).unique()),
            desc="Searching historic schedules",
        ):
            stop_times = self.stop_times.loc[sc_time]

            scheduled_trip_ids = stop_times.index.unique()

            for trip_id in tqdm(
                scheduled_trip_ids, desc="Checking if trip id in RTD", leave=False
            ):

                str_trip_id = str(trip_id)

                trip_updates = pd.DataFrame(
                    rt_db["trip_updates"].find({field_name: str_trip_id})
                ).rename(columns={field_name: "trip__trip_id"})

                if trip_updates.shape[0] > 0:
                    try:
                        service_id = self.trips.loc[
                            (sc_time, trip_id), "service_id"
                        ].item()
                    except:
                        service_id = self.trips.loc[(sc_time, trip_id), "service_id"]

                    if completed_trips.get((trip_id, service_id)) is not None:
                        # print("B")
                        continue

                    if service_id not in self.calendar.index.get_level_values(
                        1
                    ) and service_id not in self.calendar_dates.index.get_level_values(
                        1
                    ):
                        # print("C: ", service_id)
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
                        min_date = self.calendar.loc[
                            (sc_time, service_id), "start_date"
                        ]
                    except:
                        min_date = self.calendar_dates.loc[
                            (sc_time, service_id), "date"
                        ].min()

                    try:
                        min_date = min_date.item()
                    except:
                        pass

                    try:
                        max_date = self.calendar.loc[(sc_time, service_id), "end_date"]
                    except:
                        max_date = self.calendar_dates.loc[
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
                            merged_arrivals = self.calulate_delay(
                                str_trip_id, trip_updates, sc_time
                            )
                            
                        except:
                            # print("F: ", trip_id)
                            continue

                        if merged_arrivals is None:
                            # print("E")
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
                                collection = rt_delay_db[date_frame[0]]
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
                    # else:
                    #     print("D: ", str_trip_id)
                # else:
                #     print("A: ", str_trip_id)

        client.close()

    # def skips_for_trip(self, trip_id, trip_updates):
    #     trip_id = str(trip_id)
    #     x = trip_updates.loc[trip_updates.trip__trip_id == trip_id].assign(
    #         day=lambda x: x.timestamp.astype("datetime64[s]").dt.day
    #     )
    #     days = x.day.unique()
    #     days = days[~np.isnan(days)]
    #     stops = np.unique(
    #         x.loc[:, x.columns.str.contains("__stop_sequence")].values.flatten()
    #     )
    #     stops = stops[~np.isnan(stops)]
    #     x = x.loc[
    #         :, ~x.map(lambda x: np.nan if x == "NONE" else x).isnull().all(axis=0)
    #     ]

    #     aatp = {}
    #     for day in days:
    #         x_day = x.loc[x.day == day]
    #         stop_seqs = x_day.loc[:, x_day.columns.str.contains("__stop_sequence")]

    #         for i in range(stop_seqs.shape[1]):
    #             s = stop_seqs[f"stop_time_update_{i}__stop_sequence"]
    #             pair = s.iloc[::-1].drop_duplicates(keep="first").to_dict()
    #             pair = {v: k for k, v in pair.items()}
    #             for k in pair.keys():
    #                 if (k, day) not in aatp.keys() and not np.isnan(k):
    #                     aatp[(k, day)] = (
    #                         pair[k],
    #                         i,
    #                         x.loc[pair[k], "_id"].generation_time.timestamp()
    #                         - x.loc[
    #                             pair[k], f"stop_time_update_{i}__arrival__time"
    #                         ].item(),
    #                     )

    #     aatp = pd.DataFrame(aatp).T.reset_index()
    #     aatp = aatp.rename(
    #         columns={
    #             k: v
    #             for k, v in zip(
    #                 aatp.columns, ["stop_sequence", "day", "ind", "col", "time"]
    #             )
    #         }
    #     )
    #     skip_df = aatp.groupby("stop_sequence").agg({"col": ["max", "min", "mean"]})
    #     time_df = aatp.groupby("stop_sequence").agg({"time": ["max", "min", "mean"]})
    #     return pd.concat([skip_df, time_df], axis=1), aatp


if __name__ == "__main__":
    # cities = (
    #     "San Francisco,New York City,Atlanta,Miami,Salt Lake City".lower()
    #     .replace(" ", "_")
    #     .split(",")
    # )

    cities = (
        "Atlanta,Salt Lake City,San Francisco,New York City".lower()
        .replace(" ", "_")
        .split(",")
    )

    # cities = "Salt Lake City".lower().replace(" ", "_").split(",")

    for city in cities:
        print(f"starting for {city}")
        gtfs = GTFS(city)
        gtfs.run_delay_analyzer()
