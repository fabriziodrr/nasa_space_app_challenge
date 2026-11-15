# SLOTH: migrazione SQLite → Supabase PostgreSQL

Questa procedura prepara i due archivi separati (`sloth_agent` per Prisma e `sloth_data` per il servizio Python) nello stesso progetto Supabase. Il supporto PostgreSQL è alternativo a SQLite: non eseguire il seed su un database con dati da conservare. Il deploy e l'autenticazione pubblica restano da completare separatamente.

## Prima di iniziare

1. Creare un progetto Supabase **SLOTH** e ottenere dalla sezione Connect le stringhe PostgreSQL. Non incollarle in chat, non metterle in Git e non esporle al browser.
2. Usare una connessione **session pooler o diretta** per migrazioni e copia, e una **transaction pooler** per l'app serverless. Seguire le [istruzioni Supabase per Prisma](https://supabase.com/docs/guides/database/prisma), inclusi i parametri richiesti dal pooler.
3. Usare un progetto/database di prova vuoto, accessi server riservati e password robuste. Non esporre gli schemi `sloth_agent` e `sloth_data` attraverso le API pubbliche. Prima di usare dati reali occorrono controlli d'accesso appropriati.
4. Fermare i servizi locali e creare copie di sicurezza coerenti di `prisma/dev.db` e `server/data/aegis.sqlite3`. Se si usa SQLite in modalità WAL, includere correttamente il WAL o usare l'API backup di SQLite. Le istruzioni successive non cancellano i file originali.

## 1. Installare il driver Python

Da PowerShell, nella root:

```powershell
server\.venv\Scripts\python.exe -m pip install -e "server[postgres]"
```

## 2. Creare gli schemi

Impostare le variabili solo nel terminale corrente o in un file locale escluso da Git. Gli esempi sono segnaposto: utilizzare stringhe complete copiate dalla dashboard, con password codificata per URL se necessario e TLS configurato. `DATABASE_URL` e `DIRECT_URL` devono entrambi specificare `schema=sloth_agent`; mantenere gli eventuali parametri già presenti usando `&`.

```powershell
$env:DATABASE_URL = '<transaction pooler URL con ?pgbouncer=true&schema=sloth_agent>'
$env:DIRECT_URL = '<session pooler o direct URL con ?schema=sloth_agent>'
# URI senza il parametro Prisma schema= o pgbouncer=, usato da psycopg e psql:
$env:SLOTH_MIGRATION_DATABASE_URL = '<session pooler o direct URL PostgreSQL>'
npm.cmd run db:migrate:postgres
psql $env:SLOTH_MIGRATION_DATABASE_URL -v ON_ERROR_STOP=1 -f server/sql/postgres.sql
```

Prisma crea le proprie tabelle nello schema specificato nell'URL. Verificare `schema=sloth_agent` **prima** di lanciare il comando; non usare `prisma db push` o `db:seed` per questa migrazione. Il ruolo di migrazione deve poter creare schemi e tabelle.

## 3. Copiare i dati locali

Con entrambi i servizi fermi e i due archivi di destinazione vuoti:

```powershell
server\.venv\Scripts\python.exe scripts/migrate_sqlite_to_postgres.py --agent-db prisma/dev.db --data-db server/data/aegis.sqlite3
```

La copia legge le sorgenti in sola lettura e inserisce entrambi gli archivi in una transazione PostgreSQL: controlla struttura, destinazione vuota e numero di righe, interrompendosi in caso di incompatibilità. Un secondo tentativo su una destinazione piena viene rifiutato. Conservare i backup finché la verifica funzionale non è terminata.

## 4. Configurare e verificare

Per Next/agent, `DATABASE_URL` deve puntare al transaction pooler con `schema=sloth_agent`, `DIRECT_URL` alla connessione session/direct con lo stesso schema. Generare il client PostgreSQL prima di avviare l'app:

```powershell
npm.cmd run db:generate:postgres
npm.cmd run dev
```

Per il backend Python impostare nel suo processo `AEGIS_DATABASE_URL` alla connessione PostgreSQL, senza parametri specifici di Prisma. Se è presente, questa variabile ha priorità su `AEGIS_DB_PATH`; altrimenti il backend continua a usare SQLite. Usare la stessa destinazione Supabase, con credenziali appropriate e TLS.

Verificare profili, dati sintetici, check-in, report, diario, schedule e approvazioni, inclusi aggiornamenti concorrenti. In produzione utilizzare `npm run build:postgres` per non rigenerare il client SQLite. Per tornare allo sviluppo SQLite, ripristinare `DATABASE_URL=file:./dev.db`, rimuovere `AEGIS_DATABASE_URL` dall'ambiente Python ed eseguire `npm run db:generate`. Non alternare client generati mentre un server Next è in esecuzione.

Per i test Python opzionali su PostgreSQL, solo su un database **sacrificabile** già inizializzato con `server/sql/postgres.sql`, impostare `SLOTH_TEST_POSTGRES_URL` e lanciare `pytest server/tests`. Non usare un database con dati importanti per i test.
