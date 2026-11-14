"""Atomic JSON import: python -m aegis_data import examples/synthetic.json."""
import argparse
import json
import os
from pathlib import Path

from pydantic import ValidationError

from .store import DuplicateObservation, Store


def main():
    parser = argparse.ArgumentParser(description="AEGIS data tools")
    parser.add_argument("command", choices=["import"])
    parser.add_argument("file", type=Path)
    parser.add_argument("--db", default=os.environ.get("AEGIS_DB_PATH", "data/aegis.sqlite3"))
    args = parser.parse_args()
    try:
        rows = json.loads(args.file.read_text(encoding="utf-8"))
        if not isinstance(rows, list) or not rows or len(rows) > 10000:
            raise ValueError("expected a JSON array of 1 to 10000 observations")
        result = Store(args.db).add_many(rows)
    except (OSError, ValueError, ValidationError, DuplicateObservation) as exc:
        parser.exit(1, f"Import failed: {exc}\n")
    print(f"Imported {len(result)} observations. Synthetic labels preserved.")


if __name__ == "__main__":
    main()
