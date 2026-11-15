"""PostgreSQL implementation of the observation store.

The schema is provisioned separately, not on an application request. Keeping
timestamps and payloads in their existing textual form preserves legacy rows.
"""
import json
from datetime import datetime, timezone

from .models import utc_iso
from .store import ADAPTER, DuplicateObservation


class PostgresStore:
    def __init__(self, url: str):
        self.url = url

    def connection(self):
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise RuntimeError("Install aegis-data[postgres] to use PostgreSQL") from exc
        # Supabase's transaction pooler does not support session prepared statements.
        return psycopg.connect(self.url, row_factory=dict_row, prepare_threshold=None)

    def add(self, observation):
        return self.add_many([observation])[0]

    def add_many(self, observations: list) -> list[dict]:
        import psycopg
        items = [ADAPTER.validate_python(item) for item in observations]
        recorded_at = utc_iso(datetime.now(timezone.utc))
        output = []
        try:
            with self.connection() as conn:
                for item in items:
                    payload = item.model_dump(mode="json")
                    payload["observed_at"] = utc_iso(item.observed_at)
                    conn.execute(
                        "INSERT INTO sloth_data.observations "
                        "(observation_id, subject_id, observed_at, recorded_at, synthetic, payload) "
                        "VALUES (%s, %s, %s, %s, %s, %s)",
                        (item.observation_id, item.subject_id, payload["observed_at"],
                         recorded_at, int(item.synthetic), json.dumps(payload)),
                    )
                    output.append({**payload, "recorded_at": recorded_at})
        except psycopg.errors.UniqueViolation as exc:
            raise DuplicateObservation("duplicate observation_id; transaction rolled back") from exc
        return output

    def list(self, subject_id: str, synthetic: bool = False,
             start: datetime | None = None, end: datetime | None = None) -> tuple[list[dict], bool]:
        if start and end and start > end:
            raise ValueError("start must be before end")
        sql = "SELECT payload, recorded_at FROM sloth_data.observations WHERE subject_id=%s AND synthetic=%s"
        args = [subject_id, int(synthetic)]
        if start:
            sql += " AND observed_at >= %s"
            args.append(utc_iso(start))
        if end:
            sql += " AND observed_at <= %s"
            args.append(utc_iso(end))
        sql += " ORDER BY observed_at DESC, observation_id DESC LIMIT 1001"
        with self.connection() as conn:
            rows = conn.execute(sql, args).fetchall()
        result = []
        for row in rows[:1000]:
            payload = json.loads(row["payload"])
            if payload.get("kind") in ("sleep", "mood") and "scale_max" not in payload:
                payload["scale_max"] = None
            if payload.get("kind") == "speech_feedback" and "mood_scale_max" not in payload:
                payload["mood_scale_max"] = None
            result.append({**payload, "recorded_at": row["recorded_at"]})
        return result, len(rows) > 1000
