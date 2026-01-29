import sys
from pathlib import Path
import logging
sys.path.append(str(Path(__file__).resolve().parents[1]))
import asyncio
from pipeline import stream_rt_data

# logging.basicConfig(
#     filename="logs/app.log",
#     level=logging.INFO,  # Minimum logging level to record (e.g., DEBUG, INFO, WARNING, ERROR, CRITICAL)
#     format="%(asctime)s - %(levelname)s - %(message)s",  # Format of log messages
#     datefmt="%Y-%m-%d %H:%M:%S",  # Format for the timestamp
#     filemode="a",
# )

# logging.info(f"RT ran")


if __name__ == "__main__":
    asyncio.run(stream_rt_data())