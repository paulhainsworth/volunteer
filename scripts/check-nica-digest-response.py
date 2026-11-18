"""Summarize the digest response without printing recipient information."""

import json
import sys


def main():
    try:
        response = json.load(sys.stdin)
    except (UnicodeDecodeError, json.JSONDecodeError):
        print("NICA digest returned an invalid response.", file=sys.stderr)
        return 1

    if not isinstance(response, dict):
        print("NICA digest returned an invalid response.", file=sys.stderr)
        return 1

    failures = response.get("errors", [])
    if not isinstance(failures, list):
        print("NICA digest returned an invalid delivery status.", file=sys.stderr)
        return 1
    if failures:
        print(f"NICA digest reported {len(failures)} delivery or configuration failures.", file=sys.stderr)
        return 1

    if response.get("skipped") is True:
        print("NICA digest skipped this invocation.")
        return 0

    sent = response.get("sent")
    if response.get("success") is not True or type(sent) is not int or sent < 0:
        print("NICA digest did not report a successful delivery result.", file=sys.stderr)
        return 1
    print(f"NICA digest sent {sent} messages.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
