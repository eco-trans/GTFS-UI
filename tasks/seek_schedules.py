import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[1]))
from pipeline import *

if __name__ == "__main__":
    asyncio.run(update_schedules())