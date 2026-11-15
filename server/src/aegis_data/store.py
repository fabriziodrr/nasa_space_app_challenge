import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

from pydantic import TypeAdapter

from .models import Observation, utc_iso

ADAPTER = TypeAdapter(Observation)


def create_store(location: str | Path):
    """Select the database explicitly; a file path keeps the local SQLite store."""
    value = str(location)
    if value.startswith(("postgresql://", "postgres://")):
        from .postgres_store import PostgresStore
        return PostgresStore(value)
    if "://" in value:
        raise ValueError("unsupported data backend URL")
    return Store(location)


class DuplicateObservation(ValueError):
    pass


class Store:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.connection() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS observations (
                    observation_id TEXT PRIMARY KEY,
                    subject_id TEXT NOT NULL,
                    observed_at TEXT NOT NULL,
                    recorded_at TEXT NOT NULL,
                    synthetic INTEGER NOT NULL,
                    payload TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS observations_subject_time
                    ON observations(subject_id, synthetic, observed_at);
            """)

    @contextmanager
    def connection(self):
        conn = sqlite3.connect(self.path, timeout=10)
        conn.row_factory = sqlite3.Row
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def add(self, observation: Observation) -> dict:
        return self.add_many([observation])[0]

    def add_many(self, observations: list) -> list[dict]:
        # Validate even when called directly by an importer or an agent adapter.
        items = [ADAPTER.validate_python(item) for item in observations]
        recorded_at = utc_iso(datetime.now(timezone.utc))
        output = []
        try:
            with self.connection() as conn:
                for item in items:
                    payload = item.model_dump(mode="json")
                    payload["observed_at"] = utc_iso(item.observed_at)
                    conn.execute(
                        "INSERT INTO observations VALUES (?, ?, ?, ?, ?, ?)",
                        (item.observation_id, item.subject_id, payload["observed_at"],
                         recorded_at, int(item.synthetic), json.dumps(payload)),
                    )
                    output.append({**payload, "recorded_at": recorded_at})
        except sqlite3.IntegrityError as exc:
            raise DuplicateObservation("duplicate observation_id; transaction rolled back") from exc
        return output

    def list(self, subject_id: str, synthetic: bool = False,
             start: datetime | None = None, end: datetime | None = None) -> tuple[list[dict], bool]:
        if start and end and start > end:
            raise ValueError("start must be before end")
        sql = "SELECT payload, recorded_at FROM observations WHERE subject_id=? AND synthetic=?"
        args: list = [subject_id, int(synthetic)]
        if start:
            sql += " AND observed_at >= ?"
            args.append(utc_iso(start))
        if end:
            sql += " AND observed_at <= ?"
            args.append(utc_iso(end))
        sql += " ORDER BY observed_at DESC, observation_id DESC LIMIT 1001"
        with self.connection() as conn:
            rows = conn.execute(sql, args).fetchall()
        def preserve_scale(row):
            payload = json.loads(row["payload"])
            if payload.get("kind") in ("sleep", "mood") and "scale_max" not in payload:
                payload["scale_max"] = None
            if payload.get("kind") == "speech_feedback" and "mood_scale_max" not in payload:
                payload["mood_scale_max"] = None
            return {**payload, "recorded_at": row["recorded_at"]}
        return ([preserve_scale(row) for row in rows[:1000]], len(rows) > 1000)
