import csv

import numpy as np
import pandas as pd
import geopandas as gpd
from shapely import Point, LineString
import networkx as nx
from tqdm import tqdm

from initialize_db import get_connection


def find_schedule(schedule, date, trip_id):
    calendar_collections = [
        i
        for i in schedule.list_collection_names()
        if i.split("___")[-1].lower() == "calendar"
    ]
    for calendar_name in calendar_collections:
        calendar = pd.DataFrame(schedule[calendar_name].find({}))
        calendar = calendar.assign(
            start_date=lambda x: pd.to_datetime(x.start_date, format='%Y%m%d'),
            end_date=lambda x: pd.to_datetime(x.end_date, format='%Y%m%d'),
        )
        earliest_date = calendar.start_date.min()
        latest_date = calendar.end_date.max()
        if (earliest_date <= pd.to_datetime(date)) and (
            pd.to_datetime(date) <= latest_date
        ):
            timestamp = calendar_name.split("_")[0]
            trip_name = str(timestamp) + "_" + "trips"
            trip = schedule[trip_name].find_one({"trip_id": trip_id})
            if trip is None:
                continue
            service_id = trip["service_id"]
            mask = calendar.service_id == service_id
            if mask.sum() > 0:
                if (calendar[mask].start_date.item() <= pd.to_datetime(date)) and (
                    calendar[mask].end_date.item() <= latest_date
                ):
                    break
            else:
                calendar_dates_name = str(timestamp) + "_" + "calendar_dates"
                calendar_dates = pd.DataFrame(
                    schedule[calendar_dates_name].find({"service_id": service_id})
                ).assign(date=lambda x: pd.to_datetime(x.date))
                if (calendar_dates.date.min() <= pd.to_datetime(date)) and (
                    pd.to_datetime(date) <= calendar_dates.date.max()
                ):
                    break
    return int(timestamp)


def off_network_distance(A: Point, B: Point, line: LineString):

    dA = line.project(A)
    dB = line.project(B)

    A_proj = line.interpolate(dA)
    B_proj = line.interpolate(dB)

    A_proj_coord = A_proj.coords[0]
    B_proj_coord = B_proj.coords[0]

    coords = list(line.coords)
    G = nx.Graph()

    for u, v in zip(coords[:-1], coords[1:]):
        G.add_edge(u, v, weight=Point(u).distance(Point(v)))

    def connect_projection(proj_point, proj_dist):
        proj_coord = proj_point.coords[0]

        cum = 0.0
        for u, v in zip(coords[:-1], coords[1:]):
            seg = LineString([u, v])
            seg_len = seg.length

            if cum <= proj_dist <= cum + seg_len:
                G.add_edge(proj_coord, u, weight=Point(proj_coord).distance(Point(u)))
                G.add_edge(proj_coord, v, weight=Point(proj_coord).distance(Point(v)))
                return

            cum += seg_len

    connect_projection(A_proj, dA)
    connect_projection(B_proj, dB)

    net_dist = nx.shortest_path_length(
        G, source=A_proj_coord, target=B_proj_coord, weight="weight"
    )

    return A.distance(A_proj) + net_dist + B.distance(B_proj)


def ata_by_euclidean(vehicle_positions, stops, network=None):
    pwd = np.array(
        [i.distance(vehicle_positions.geometry) for i in stops.geometry.values]
    )
    ata = np.zeros(pwd.shape[0])
    for sid in range(pwd.shape[0]):
        distances = np.argsort(pwd[sid])
        counter = 2
        u, v = distances[:counter]
        while (
            (
                vehicle_positions.loc[u, "geometry"].distance(
                    vehicle_positions.loc[v, "geometry"]
                )
                == 0
            )
            or (
                vehicle_positions.loc[u, "geometry"].distance(
                    vehicle_positions.loc[v, "geometry"]
                )
                < pwd[sid, u]
            )
            or (
                vehicle_positions.loc[u, "geometry"].distance(
                    vehicle_positions.loc[v, "geometry"]
                )
                < pwd[sid, v]
            )
        ):
            counter += 1
            try:
                v = distances[counter]
            except:
                break

        distance = vehicle_positions.loc[u, "geometry"].distance(
            vehicle_positions.loc[v, "geometry"]
        )
        if distance != 0:
            time_period = (
                vehicle_positions.loc[v, "timestamp"]
                - vehicle_positions.loc[u, "timestamp"]
            )
            speed = distance / time_period
            if network is None:
                time_taken = pwd[sid, u] / speed
            else:
                distance = off_network_distance(
                    stops.loc[sid, "geometry"],
                    vehicle_positions.loc[u, "geometry"],
                    network,
                )
                time_taken = distance / speed
        else:
            time_taken = 0

        ata[sid] = vehicle_positions.loc[u, "timestamp"] + time_taken

    tdiff = np.diff(ata).astype(float)
    mask = tdiff < 0

    if mask.sum() > 0:
        ata[1:][mask] = np.nan
        ata = (
            pd.Series(ata)
            .interpolate(method="linear", limit_direction="both")
            .astype("int")
            .values
        )

    return ata


def vp_ata_for_trip_date(client, trip_id, date, freq=1):
    vp = client["san_francisco__vehicle_positions"][date]
    schedule = client["san_francisco__schedule"]

    vehicle_positions = list(vp.find({"trip__trip_id": str(trip_id)}).sort("timestamp"))

    vehicle_positions = (
        pd.DataFrame(vehicle_positions).iloc[::freq, :].reset_index(drop=True)
    )

    if len(vehicle_positions) < 10:
        return None

    columns = "trip__start_date,timestamp,trip__route_id,trip__trip_id,vehicle__id"
    vehicle_positions = gpd.GeoDataFrame(
        vehicle_positions[columns.split(",")],
        geometry=gpd.points_from_xy(
            vehicle_positions.position__longitude, vehicle_positions.position__latitude
        ),
    )
    schedule_timestamp = find_schedule(schedule, date, trip_id)
    
    stop_times = pd.DataFrame(
        schedule[f"{schedule_timestamp}___None___stop_times"].find({"trip_id": trip_id})

    ).loc[:, "stop_sequence,stop_id,arrival_time".split(",")]

    stops = pd.DataFrame(
        schedule[f"{schedule_timestamp}___None___stops"].find(
            {"stop_id": {"$in": stop_times.stop_id.to_list()}}
        )
    ).loc[:, "stop_id,stop_lat,stop_lon".split(",")]

    stops = stops.merge(stop_times, on="stop_id", how="outer")
    columns = "stop_id,stop_sequence,arrival_time,stop_lat,stop_lon"
    stops = (
        gpd.GeoDataFrame(
            stops[columns.split(",")],
            geometry=gpd.points_from_xy(stops.stop_lon, stops.stop_lat),
        )
        .astype({"stop_sequence": int})
        .sort_values("stop_sequence", ignore_index=True)
    )

    stops["date"] = date
    stops["trip_id"] = trip_id
    stops["actual_arrival_time"] = ata_by_euclidean(vehicle_positions, stops, None)

    stops = stops.drop("geometry", axis=1).astype({"actual_arrival_time": int})
    return stops


if __name__ == "__main__":
    client, db = get_connection()
    all_tu_dates = sorted([i for i in client["san_francisco__trip_updates"].list_collection_names() if "2026-02" in i])
    client.close()

    fieldnames = "stop_id,stop_sequence,arrival_time,stop_lat,stop_lon,date,trip_id,actual_arrival_time".split(",")
    file_name = "gtfs_february_san_francisco.csv"

    try:
        g = pd.read_csv(file_name, usecols=["date"])
    except:
        with open(file_name, mode='w', newline='', encoding='utf-8') as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames)
            writer.writeheader()
    
    client, _ = get_connection()
    for date in tqdm(all_tu_dates):
        if date<=g.date.unique().max():
            continue
        for trip_id in tqdm(client["san_francisco__vehicle_positions"][date].distinct("trip__trip_id"), leave=False, desc=date):
            output = None
            try:
                output = vp_ata_for_trip_date(client, trip_id, date, 1)
            except:
                output = None
            if (output is not None) and (not output.empty):
                with open(file_name, mode='a', newline='', encoding='utf-8') as file:
                    writer = csv.DictWriter(file, fieldnames=fieldnames)
                    writer.writerows(output.to_dict(orient="records"))
    client.close()
