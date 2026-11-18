"""Check scheduled workflow history without exposing job output."""

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("run_id", nargs="?")
    mode.add_argument("--latest", action="store_true", help="Check age of the newest scheduled run")
    args = parser.parse_args()

    try:
        runs = {
            str(run["databaseId"]): datetime.fromisoformat(
                run["createdAt"].replace("Z", "+00:00")
            )
            for run in json.load(sys.stdin)
        }
        if args.latest:
            current = datetime.now(timezone.utc)
            previous = max(runs.values(), default=None)
        else:
            current = runs[args.run_id]
            previous = max((created for created in runs.values() if created < current), default=None)
        if previous is not None and previous > current:
            raise ValueError("Run timestamp is in the future")
        gap = None if previous is None else current - previous
    except (IndexError, KeyError, ValueError, TypeError, AttributeError):
        print("Could not verify the NICA schedule history.", file=sys.stderr)
        return 1

    if gap is None:
        if args.latest:
            print("No scheduled NICA run found.", file=sys.stderr)
            return 1
        print("No earlier scheduled NICA run is available for comparison.")
        return 0

    metric = "Latest scheduled NICA run age" if args.latest else "NICA schedule gap"
    minutes = int(gap.total_seconds() // 60)
    if gap > timedelta(minutes=45):
        print(f"{metric} exceeded 45 minutes ({minutes} minutes).", file=sys.stderr)
        return 1
    print(f"{metric} was {minutes} minutes.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
