"""Copy both local SQLite archives into empty SLOTH PostgreSQL schemas.

Run against a fresh, migrated target while both local services are stopped. The
destination is checked and written in one transaction; source files are read-only.
"""
import argparse
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import psycopg
from psycopg import sql


AGENT_TABLES = [
    "DemoIdentity", "ConversationSession", "ConversationMessage", "CheckIn",
    "VisionObservation", "VisionSelection", "CheckInContextSnapshot", "Turn",
    "ScheduleProposal", "ProposalDecision", "GroundReport", "DiaryEntry",
    "GenerationClaim", "ScheduleSnapshot", "ScheduleApplication",
]


def open_readonly(path: Path):
    if not path.is_file():
        raise ValueError(f"SQLite file not found: {path}")
    connection = sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True)
    connection.execute("BEGIN")
    return connection


def convert(value, target_type):
    if value is None:
        return None
    if target_type == "boolean":
        if value not in (0, 1):
            raise ValueError("Invalid SQLite boolean")
        return bool(value)
    if target_type.startswith("timestamp"):
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value / 1000, timezone.utc).replace(tzinfo=None)
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt
    return value


def copy_table(source, destination, schema, table):
    columns = destination.execute(
        "SELECT column_name, data_type FROM information_schema.columns "
        "WHERE table_schema=%s AND table_name=%s ORDER BY ordinal_position", (schema, table)
    ).fetchall()
    if not columns:
        raise ValueError(f"Target table missing: {schema}.{table}")
    source_columns = [row[1] for row in source.execute(f'PRAGMA table_info("{table}")')]
    names = [column[0] for column in columns]
    if set(source_columns) != set(names):
        raise ValueError(f"Schema mismatch for {schema}.{table}; migration stopped")
    target = sql.Identifier(schema, table)
    if destination.execute(sql.SQL("SELECT EXISTS (SELECT 1 FROM {})").format(target)).fetchone()[0]:
        raise ValueError(f"Target table is not empty: {schema}.{table}")
    quoted = ", ".join('"' + name.replace('"', '""') + '"' for name in names)
    reader = source.execute(f'SELECT {quoted} FROM "{table}"')
    insert = sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
        target, sql.SQL(", ").join(map(sql.Identifier, names)),
        sql.SQL(", ").join(sql.Placeholder() for _ in names),
    )
    count = 0
    with destination.cursor() as cursor:
        while batch := reader.fetchmany(500):
            cursor.executemany(insert, [tuple(convert(v, col[1]) for v, col in zip(row, columns)) for row in batch])
            count += len(batch)
    actual = destination.execute(sql.SQL("SELECT count(*) FROM {}").format(target)).fetchone()[0]
    if actual != count:
        raise ValueError(f"Count mismatch for {schema}.{table}")
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--agent-db", type=Path, required=True)
    parser.add_argument("--data-db", type=Path, required=True)
    args = parser.parse_args()
    url = os.environ.get("SLOTH_MIGRATION_DATABASE_URL")
    if not url:
        parser.error("Set SLOTH_MIGRATION_DATABASE_URL to the PostgreSQL session/direct connection")
    with open_readonly(args.agent_db) as agent, open_readonly(args.data_db) as data:
        source_tables = {row[0] for row in agent.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' "
            "AND name != '_prisma_migrations'"
        )}
        if source_tables != set(AGENT_TABLES):
            raise ValueError("Agent SQLite schema differs from the expected schema; migration stopped")
        with psycopg.connect(url, prepare_threshold=None) as target:
            for table in AGENT_TABLES:
                print(f"{table}: {copy_table(agent, target, 'sloth_agent', table)} rows")
            print(f"observations: {copy_table(data, target, 'sloth_data', 'observations')} rows")
    print("Migration committed. Source SQLite files were not modified.")


if __name__ == "__main__":
    main()
