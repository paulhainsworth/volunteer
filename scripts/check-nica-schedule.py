"""Check scheduled workflow history without exposing job output."""

import json
import sys
from datetime import datetime, timedelta


def main():
    try:
        runs = {
            str(run["databaseId"]): datetime.fromisoformat(
                run["createdAt"].replace("Z", "+00:00")
            )
            for run in json.load(sys.stdin)
        }
        current = runs[sys.argv[1]]
        previous = max((created for created in runs.values() if created < current), default=None)
    except (IndexError, KeyError, ValueError, TypeError, AttributeError):
        print("Could not verify the NICA schedule history.", file=sys.stderr)
        return 1

    if previous is None:
        print("No earlier scheduled NICA run is available for comparison.")
        return 0

    gap = current - previous
    minutes = int(gap.total_seconds() // 60)
    if gap > timedelta(minutes=45):
        print(f"NICA schedule gap exceeded 45 minutes ({minutes} minutes).", file=sys.stderr)
        return 1
    print(f"NICA schedule gap was {minutes} minutes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
