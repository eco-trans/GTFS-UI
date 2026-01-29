import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[1]))
from pipeline import *
logging.basicConfig(
    filename="logs/app.log",
    level=logging.INFO,  # Minimum logging level to record (e.g., DEBUG, INFO, WARNING, ERROR, CRITICAL)
    format="%(asctime)s - %(levelname)s - %(message)s",  # Format of log messages
    datefmt="%Y-%m-%d %H:%M:%S",  # Format for the timestamp
    filemode="a",
)

logging.info(f"GTFS ran")

if __name__ == "__main__":
    asyncio.run(update_schedules())