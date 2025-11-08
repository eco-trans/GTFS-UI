import numpy as np
import pandas as pd
from tqdm import tqdm
from initialize_db import get_connection


class GTFS:
    def __init__(self, location) -> None:
        self.location = location
        client, _ = get_connection()
        self.sc_db = client[f"{location}__schedule"]

        for i in self.sc_db.list_collections():
            if i["name"] == "NA":
                continue

            df = pd.DataFrame(self.sc_db[i["name"]].find({}))
            if "trip_id" in df:
                df = df.astype({"trip_id": "str"})
            
                
            if hasattr(self, i["name"].split("___")[-1]):
                df = pd.concat([df, getattr(self, i["name"].split("___")[-1])], axis=0)

            setattr(
                self,
                i["name"].split("___")[-1],
                df,
            )

        client.close()

    def actual_arrivals_for_trip(self, trip_id, trip_updates):
        x = trip_updates.loc[trip_updates.trip__trip_id == trip_id].assign(
            day=lambda x: x.timestamp.astype("datetime64[s]").dt.day
        )

        if "trip__schedule_relationship" in x.columns:
            mask = x.trip__schedule_relationship == "CANCELED"
            x = x.loc[~mask]
            if x.shape[0] == 0:
                return None

        days = x.day.unique()
        days = days[~np.isnan(days)]
        stops = np.unique(
            x.loc[:, x.columns.str.contains("__stop_sequence")].values.flatten()
        )
        stops = stops[~np.isnan(stops)]
        x = x.loc[
            :, ~x.map(lambda x: np.nan if x == "NONE" else x).isnull().all(axis=0)
        ]

        aatp = {}
        for day in days:
            x_day = x.loc[x.day ==  day]
            stop_seqs = x_day.loc[:, x_day.columns.str.contains("__stop_sequence")]

            for i in range(stop_seqs.shape[1]):
                s = stop_seqs[f"stop_time_update_{i}__stop_sequence"]
                pair = s.iloc[::-1].drop_duplicates(keep="first").to_dict()
                pair = {v: k for k, v in pair.items()}
                for k in pair.keys():
                    if (
                        f"stop_time_update_{i}__schedule_relationship" in x.columns
                        and x.loc[
                            pair[k], f"stop_time_update_{i}__schedule_relationship"
                        ]
                        == "SKIPPED"
                    ):
                        continue
                    if (k, day) not in aatp.keys() and not np.isnan(k):
                        aatp[(k, day)] = (pair[k], i)

        aatp = pd.DataFrame(aatp).T.reset_index()
        aatp = aatp.rename(
            columns={
                k: v
                for k, v in zip(aatp.columns, ["stop_sequence", "day", "ind", "col"])
            }
        )

        aat = []
        for row in aatp.itertuples():
            try:
                aat.append(
                    {
                        "stop_sequence": row.stop_sequence,
                        "day": row.day,
                        "actual_arrival_time": x.loc[
                            row.ind, f"stop_time_update_{row.col}__arrival__time"
                        ].item(),
                    }
                )
            except:
                aat.append(
                    {
                        "stop_sequence": row.stop_sequence,
                        "day": row.day,
                        "actual_arrival_time": x.loc[
                            row.ind, f"stop_time_update_{row.col}__departure__time"
                        ].item(),
                    }
                )

        aat = pd.DataFrame(aat)

        if aat.shape[0] == 0:
            return None

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

    def calulate_delay(self, trip_id, trip_updates):
        estimated_arrivals = self.stop_times.loc[
            self.stop_times.trip_id == trip_id, ["stop_sequence", "arrival_time"]
        ].rename(columns={"arrival_time": "scheduled_arrival_time"})

        actual_arrivals = self.actual_arrivals_for_trip(trip_id, trip_updates)

        if actual_arrivals is None:
            return None

        try:
            actual_arrivals = actual_arrivals.assign(
                actual_arrival_time=lambda x: x.actual_arrival_time.dt.tz_convert(
                    self.agency.agency_timezone.unique().item()
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
        return merged_arrivals

    def skips_for_trip(self, trip_id, trip_updates):
        trip_id = str(trip_id)
        x = trip_updates.loc[trip_updates.trip__trip_id == trip_id].assign(
            day=lambda x: x.timestamp.astype("datetime64[s]").dt.day
        )
        days = x.day.unique()
        days = days[~np.isnan(days)]
        stops = np.unique(
            x.loc[:, x.columns.str.contains("__stop_sequence")].values.flatten()
        )
        stops = stops[~np.isnan(stops)]
        x = x.loc[
            :, ~x.map(lambda x: np.nan if x == "NONE" else x).isnull().all(axis=0)
        ]

        aatp = {}
        for day in days:
            x_day = x.loc[x.day == day]
            stop_seqs = x_day.loc[:, x_day.columns.str.contains("__stop_sequence")]

            for i in range(stop_seqs.shape[1]):
                s = stop_seqs[f"stop_time_update_{i}__stop_sequence"]
                pair = s.iloc[::-1].drop_duplicates(keep="first").to_dict()
                pair = {v: k for k, v in pair.items()}
                for k in pair.keys():
                    if (k, day) not in aatp.keys() and not np.isnan(k):
                        aatp[(k, day)] = (
                            pair[k],
                            i,
                            x.loc[pair[k], "_id"].generation_time.timestamp()
                            - x.loc[
                                pair[k], f"stop_time_update_{i}__arrival__time"
                            ].item(),
                        )

        aatp = pd.DataFrame(aatp).T.reset_index()
        aatp = aatp.rename(
            columns={
                k: v
                for k, v in zip(
                    aatp.columns, ["stop_sequence", "day", "ind", "col", "time"]
                )
            }
        )
        skip_df = aatp.groupby("stop_sequence").agg({"col": ["max", "min", "mean"]})
        time_df = aatp.groupby("stop_sequence").agg({"time": ["max", "min", "mean"]})
        return pd.concat([skip_df, time_df], axis=1), aatp

    def run_delay_analyzer(self, chunk_size=1000):
        client, _ = get_connection()
        rt_db = client[f"{self.location}__realtime"]
        try:
            rt_db["delay"].drop()
        except:
            pass

        collection = rt_db["delay"]

        field_name = (
            "trip__trip_id"
            if pd.DataFrame(rt_db["trip_updates"].find().limit(100))
            .columns.str.contains("trip__trip_id")
            .any()
            else "id__muk"
        )

        scheduled_trip_ids = self.stop_times.trip_id.unique()

        for i in tqdm(
            range(0, scheduled_trip_ids.shape[0], chunk_size),
            desc="Checking if trip id in RTD",
        ):
            ids = scheduled_trip_ids[i : i + chunk_size].tolist()
            ids = list(map(str, ids))

            trip_updates = pd.DataFrame(
                rt_db["trip_updates"].find({field_name: {"$in": ids}})
            ).rename(columns={field_name: "trip__trip_id"})

            if trip_updates.shape[0] > 0:
                for tid in tqdm(
                    trip_updates.trip__trip_id.unique(),
                    desc=f"Analyzing scheduled trip ids in RTD",
                    leave=False,
                ):
                    merged_arrivals = self.calulate_delay(tid, trip_updates)
                    if merged_arrivals is None:
                        continue

                    result = (
                        merged_arrivals.assign(
                            delay=lambda x: x.actual_arrival_time
                            - x.scheduled_arrival_time
                        )
                        .drop("day", axis=1)
                        .groupby("stop_sequence", observed=False)["delay"]
                        .agg("mean,std,max,min,count".split(","))
                        .map(lambda x: x if type(x) == int else x.total_seconds())
                        .fillna(0.0)
                        .T.to_dict()
                    )

                    collection.insert_one(
                        {
                            "trip_id": str(tid),
                            **{str(k): v for k, v in result.items()},
                        }
                    )

            i += chunk_size
 
        client.close()


if __name__ == "__main__":
    cities = (
        "San Francisco,New York City,Atlanta,Miami,Salt Lake City".lower()
        .replace(" ", "_")
        .split(",")
    )

    cities = (
        "San Francisco,Atlanta,New York City,Salt Lake City".lower()
        .replace(" ", "_")
        .split(",")
    )

    for city in cities:
        print(f"starting for {city}")
        gtfs = GTFS(city)
        gtfs.run_delay_analyzer()