# Setup and startup of the agent module (N1)

This guide describes the historical bootstrap of the agent module. For the current integrated startup of dashboard, backend, and vision, see the [main README](../../README.md). Integration contracts and agreements are in [contracts-v1.md](./contracts-v1.md).

## Prerequisites

- Node.js and `npm`.
- A `.env` file with `DATABASE_URL`. The local default is `file:./dev.db` (the file is created inside `prisma/`). Copy `.env.example` to `.env`:

```sh
cp .env.example .env
```

On PowerShell, use `npm.cmd` instead of `npm` if the policy blocks `npm.ps1`.

## Database initialization

```sh
npm run db:generate   # genera il client Prisma dallo schema
npm run db:push       # crea/aggiorna le tabelle SQLite
npm run db:seed       # carica identita demo e programma iniziale
```

`db:seed` always starts from scratch: it empties all agent tables and recreates demo identities and program. It is the **reset** command for demo data: run it whenever a clean state is needed.

### Data loaded by seed

- Demo identities `astro-1` (role `ASTRONAUT`) and `ground-1` (role `GROUND_CONTROL`, scope `["astro-1"]`), used only by `SimulatedIdentityProvider`.
- Program `schedule-1` for `astro-1`, day `2026-11-14`, version `1`, with the Earth link (locked) and sample inventory (movable), as in `docs/agent/examples/normal.json`.

## Simulated scenarios

Sensors are deterministic and reproducible; scenario choice is internal to the demo, not a field of production APIs.

| Scenario | Sensors: hours / awakenings / bpm | Declaration: hours / quality / fatigue |
| --- | --- | --- |
| `RESTED` | 8 / 1 / 60 | 8 / 4 / 1 |
| `POOR_SLEEP` | 4.8 / 6 / 72 | 4.5 / 2 / 4 |
| `CONFLICTING_DATA` | 8 / 1 / 60 | 4 / 2 / 4 |

Definitions in `server/agent/simulator/scenarios.ts`; simulated providers in `server/agent/adapters/` (`sensors.ts`, `schedule.ts`, `identity.ts`).

## Startup

```sh
npm run dev
```

The conversational demo is available at `/voice-demo`; for the integrated flow, also start the data backend and vision prototype following the main README.

## Verifications

```sh
npm run test:agent   # contratti + repository + provider + servizi
npm run typecheck
npm run lint
```

Tests create a temporary per-file SQLite database and run `prisma db push` internally, without touching `dev.db`.
