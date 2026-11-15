# SLOTH: migration SQLite → Supabase PostgreSQL

This procedure prepares the two separate archives (`sloth_agent` for Prisma and `sloth_data` for the Python service) in the same Supabase project. PostgreSQL support is an alternative to SQLite: do not run the seed on a database with data to preserve. Deployment and public authentication remain to be completed separately.

## Before starting

1. Create a Supabase project **SLOTH** and obtain the PostgreSQL connection strings from the Connect section. Do not paste them in chat, do not put them in Git, and do not expose them in the browser.
2. Use a **session pooler or direct connection** for migrations and copying, and a **transaction pooler** for the serverless app. Follow the [Supabase instructions for Prisma](https://supabase.com/docs/guides/database/prisma), including the parameters required by the pooler.
3. Use an empty test project/database, server-reserved access, and strong passwords. Do not expose the `sloth_agent` and `sloth_data` schemas through public APIs. Before using real data, appropriate access controls are required.
4. Stop local services and create consistent backups of `prisma/dev.db` and `server/data/aegis.sqlite3`. If using SQLite in WAL mode, include the WAL correctly or use the SQLite backup API. The following instructions do not delete the original files.

## 1. Install the Python driver

From PowerShell, in the root:

```powershell
server\.venv\Scripts\python.exe -m pip install -e "server[postgres]"
```

## 2. Create the schemas

Set variables only in the current terminal or in a local file excluded from Git. The examples are placeholders: use full strings copied from the dashboard, with URL-encoded password if necessary and TLS configured. `DATABASE_URL` and `DIRECT_URL` must both specify `schema=sloth_agent`; keep any existing parameters using `&`.

```powershell
$env:DATABASE_URL = '<transaction pooler URL con ?pgbouncer=true&schema=sloth_agent>'
$env:DIRECT_URL = '<session pooler o direct URL con ?schema=sloth_agent>'
# URI senza il parametro Prisma schema= o pgbouncer=, usato da psycopg e psql:
$env:SLOTH_MIGRATION_DATABASE_URL = '<session pooler o direct URL PostgreSQL>'
npm.cmd run db:migrate:postgres
psql $env:SLOTH_MIGRATION_DATABASE_URL -v ON_ERROR_STOP=1 -f server/sql/postgres.sql
```

Prisma creates its own tables in the schema specified in the URL. Verify `schema=sloth_agent` **before** running the command; do not use `prisma db push` or `db:seed` for this migration. The migration role must be able to create schemas and tables.

## 3. Copy local data

With both services stopped and both destination archives empty:

```powershell
server\.venv\Scripts\python.exe scripts/migrate_sqlite_to_postgres.py --agent-db prisma/dev.db --data-db server/data/aegis.sqlite3
```

The copy reads the sources read-only and inserts both archives in a PostgreSQL transaction: it checks structure, empty destination, and row count, stopping in case of incompatibility. A second attempt on a full destination is rejected. Keep backups until functional verification is complete.

## 4. Configure and verify

For Next/agent, `DATABASE_URL` must point to the transaction pooler with `schema=sloth_agent`, `DIRECT_URL` to the session/direct connection with the same schema. Generate the PostgreSQL client before starting the app:

```powershell
npm.cmd run db:generate:postgres
npm.cmd run dev
```

For the Python backend, set `AEGIS_DATABASE_URL` in its process to the PostgreSQL connection, without Prisma-specific parameters. If present, this variable takes precedence over `AEGIS_DB_PATH`; otherwise the backend continues to use SQLite. Use the same Supabase destination, with appropriate credentials and TLS.

Verify profiles, synthetic data, check-ins, reports, diary, schedule, and approvals, including concurrent updates. In production use `npm run build:postgres` to avoid regenerating the SQLite client. To return to SQLite development, restore `DATABASE_URL=file:./dev.db`, remove `AEGIS_DATABASE_URL` from the Python environment, and run `npm run db:generate`. Do not alternate generated clients while a Next server is running.

For optional Python tests on PostgreSQL, only on a **sacrificial** database already initialized with `server/sql/postgres.sql`, set `SLOTH_TEST_POSTGRES_URL` and run `pytest server/tests`. Do not use a database with important data for tests.
