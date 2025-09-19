import os
from dotenv import load_dotenv
from pipeline import update_schedules, stream_rt_data
import multiprocessing
import asyncio
import time

def get_schedules(interval):
    while True:
        asyncio.run(update_schedules())
        time.sleep(interval) 

def get_realtime(interval):
    while True:
        asyncio.run(stream_rt_data())
        time.sleep(interval) 

if __name__ == "__main__":
    load_dotenv()
    sch_frq = int(os.getenv("SCHEDULE_FREQUENCY"))
    rt_freq = int(os.getenv("RT_FREQUENCY"))

    p1 = multiprocessing.Process(target=get_schedules, args=(sch_frq,))
    p2 = multiprocessing.Process(target=get_realtime, args=(rt_freq,))

    p1.start()
    p2.start()

    p1.join()
    p2.join()