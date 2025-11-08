import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[1]))

import pandas as pd
from initialize_db import get_connection


class DelayDataset:
    def __init__(self, location) -> None:
        self.location = location
        client, _ = get_connection()
        self.sc_db = client[f"{location}__schedule"]
        self.rt_db = client[f"{location}__realtime"]

        # for i in self.sc_db.list_collections():
        #     if i["name"] == "NA":
        #         continue
        #     df = pd.DataFrame(self.sc_db[i["name"]].find({}))
        #     if "trip_id" in df:
        #         df = df.astype({"trip_id": "str"})

        #     if hasattr(self, i["name"].split("___")[-1]):
        #         df = pd.concat([df, getattr(self, i["name"].split("___")[-1])], axis=0)

        #     setattr(
        #         self,
        #         i["name"].split("___")[-1],
        #         df,
        #     )
        
        self.delay = pd.DataFrame(self.rt_db["delay"].find({}))
        

        client.close()

    
    def get_delay_dataset(self):
        pass

