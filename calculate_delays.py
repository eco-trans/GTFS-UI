from multiprocessing import Pool
from analysis import *


def proc(city):
    gtfs = GTFS(city)
    gtfs.run_delay_analyzer()

if __name__ == "__main__":

    cities = (
        "Atlanta,Salt Lake City,San Francisco,New York City".lower()
        .replace(" ", "_")
        .split(",")
    )

    with Pool(processes=4) as pool:
            results = pool.map(proc, cities)