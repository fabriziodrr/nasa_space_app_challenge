# Setup e avvio del modulo agent (N1)

Questa guida descrive il bootstrap storico del modulo agent. Per l'avvio integrato corrente di dashboard, backend e visione vedere il [README principale](../../README.md). I contratti e gli accordi di integrazione sono in [contracts-v1.md](./contracts-v1.md).

## Prerequisiti

- Node.js e `npm`.
- Un file `.env` con `DATABASE_URL`. Il default locale e `file:./dev.db` (il file viene creato dentro `prisma/`). Copiare `.env.example` in `.env`:

```sh
cp .env.example .env
```

Su PowerShell usare `npm.cmd` al posto di `npm` se la policy blocca `npm.ps1`.

## Inizializzazione del database

```sh
npm run db:generate   # genera il client Prisma dallo schema
npm run db:push       # crea/aggiorna le tabelle SQLite
npm run db:seed       # carica identita demo e programma iniziale
```

`db:seed` riparte sempre da zero: svuota tutte le tabelle dell'agent e ricrea identita demo e programma. E il comando di **reset** dei dati dimostrativi: rieseguirlo ogni volta che serve uno stato pulito.

### Dati caricati dal seed

- Identita demo `astro-1` (ruolo `ASTRONAUT`) e `ground-1` (ruolo `GROUND_CONTROL`, scope `["astro-1"]`), usate solo dall'`SimulatedIdentityProvider`.
- Programma `schedule-1` per `astro-1`, giorno `2026-11-14`, versione `1`, con il collegamento Terra (bloccato) e l'inventario campioni (spostabile), come in `docs/agent/examples/normal.json`.

## Scenari simulati

I sensori sono deterministi e riproducibili; la scelta dello scenario e interna alla demo, non un campo delle API di produzione.

| Scenario | Sensori: ore / risvegli / bpm | Dichiarazione: ore / qualita / stanchezza |
| --- | --- | --- |
| `RESTED` | 8 / 1 / 60 | 8 / 4 / 1 |
| `POOR_SLEEP` | 4.8 / 6 / 72 | 4.5 / 2 / 4 |
| `CONFLICTING_DATA` | 8 / 1 / 60 | 4 / 2 / 4 |

Definizioni in `server/agent/simulator/scenarios.ts`; provider simulati in `server/agent/adapters/` (`sensors.ts`, `schedule.ts`, `identity.ts`).

## Avvio

```sh
npm run dev
```

La demo conversazionale e disponibile su `/voice-demo`; per il flusso integrato avviare anche backend dati e prototipo di visione seguendo il README principale.

## Verifiche

```sh
npm run test:agent   # contratti + repository + provider + servizi
npm run typecheck
npm run lint
```

I test creano un database SQLite temporaneo per file ed eseguono `prisma db push` al loro interno, senza toccare `dev.db`.
