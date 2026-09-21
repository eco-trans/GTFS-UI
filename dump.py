import csv
import subprocess
import os
import time
import pandas as pd
from initialize_db import get_connection


if __name__ == "__main__":
    done_path = "C:/Users/muk0003/Box/Auburn_GTFS_RT_Data/done.csv"
    if not os.path.isfile(done_path):
        with open(done_path, mode="w", newline="", encoding="utf-8") as file:
            writer = csv.DictWriter(file, fieldnames=["city", "db", "collection"])
            writer.writeheader()

    done_files = pd.read_csv(done_path)

    client, db = get_connection()
    collection = db[os.getenv("METADATA_COLLECTION_NAME")]
    cities = [
        i.lower().replace(" ", "_")
        for i in pd.DataFrame(collection.find({}))["region"].values.tolist()
    ]

    for city in cities:
        print(f"starting for {city}")
        mongo_uri = "mongodb://localhost:27019"

        for gtfs_name in "alerts,trip_updates,vehicle_positions,schedule".split(","):
            db_name = f"{city}__{gtfs_name}"
            for collection_name in sorted(client[db_name].list_collection_names()):
                if collection_name == "NA":
                    continue
                if gtfs_name in ["alerts", "trip_updates", "vehicle_positions"]:
                    if (pd.to_datetime(collection_name).date() >= (pd.to_datetime(time.time(), unit="s").date() - pd.to_timedelta("3 days"))):
                        print(collection_name, "is Too New")
                        continue

                if city in done_files["city"].to_list() and db_name in done_files["db"].to_list() and str(collection_name) in done_files["collection"].to_list():
                    print(collection_name, " Already Done!")
                    continue
                
                output_directory = f"C:/Users/muk0003/Box/Auburn_GTFS_RT_Data/{city}/{gtfs_name}"
                if os.path.isdir(output_directory):
                    pass
                else:
                    os.makedirs(output_directory, exist_ok=True)

                command = [
                    "mongodump",
                    "--uri",
                    mongo_uri,
                    "--db",
                    db_name,
                    "--out",
                    output_directory,
                    "--gzip", 
                    "--collection",
                    collection_name,
                ]

                result = subprocess.run(command, capture_output=True, text=True)

                if result.returncode == 0:
                    print(f"Successfully backed up {city}/{gtfs_name}/{collection_name}")
                    with open(done_path, mode="a", newline="", encoding="utf-8") as file:
                        writer = csv.DictWriter(file, fieldnames=["city", "db", "collection"])
                        writer.writerow({
                            "city": city,
                            "db": db_name,
                            "collection": str(collection_name),
                        })
                else:
                    print(f"Failed to back up {city}/{gtfs_name}/{collection_name}. Error: {result.stderr}")

    client.close()