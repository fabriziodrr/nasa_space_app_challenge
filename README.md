# SLOTH — Astronaut wellbeing and mission support

SLOTH is a demonstration prototype that brings together an astronaut-facing AI companion and a ground-control dashboard. It combines a conversational check-in with simulated sensor readings and an optional webcam eyelid observation to help ground control understand the astronaut's reported wellbeing.

The assistant can prepare a report and propose a change to the astronaut's schedule. **Ground control must review and approve a proposal before it is applied.** The demo also includes a separate reaction-test prototype.

## What the prototype demonstrates

- A dashboard with fictional crew profiles, 3D human models and simulated measurements.
- An AI companion with text and browser-dependent voice interaction.
- An optional webcam observation of eyelid closures, with measurement quality and limitations recorded.
- A confirmed wellbeing check-in combining astronaut-reported information, simulated sensor data and an optional observation.
- Reports and schedule-change proposals for ground-control review and approval.

Sensor readings and crew profiles are **synthetic**. Eyelid observations describe only the recorded interval; they do not diagnose fatigue or measure sleep. This prototype is not a medical device, an operational NASA system or a source of NASA scheduling rules.

## Background reference

NASA's [5 Hazards of Human Spaceflight](https://www.nasa.gov/hrp/hazards/) describes isolation and confinement among the hazards astronauts face. This reference provides context for SLOTH's focus on astronaut wellbeing; it is not the source of the demo's synthetic sensor readings.

## Components

- **Dashboard and agent:** Next.js and TypeScript, in the repository root.
- **Data backend:** Python and FastAPI, in [`server/`](server/README.md).
- **Eyelid observation:** a separate Vite application in [`feature-visione-palpebrale/`](feature-visione-palpebrale/README.md), including the model and WASM assets.
- **Persistence:** two separate local SQLite databases; experimental PostgreSQL migration instructions are available [here](docs/SUPABASE_MIGRATION.md).

## Local setup

Requirements: Node.js 24.15 or later in the 24.x series, npm 11, Python 3.12 or later, and a browser with camera and microphone access. A NVIDIA API key is required for the real model; the `mock` provider works without one. Browser speech support varies.

From the repository root in PowerShell:

```powershell
Copy-Item .env.example .env
npm.cmd ci
npm.cmd run db:generate
npm.cmd run db:push
npm.cmd --prefix feature-visione-palpebrale/vision-prototype ci
cd server
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
cd ..
```

Edit `.env` locally: set `AGENT_DEMO_ENABLED=true` and a private `AGENT_DEMO_TOKEN` of at least 16 characters. For NVIDIA, set `AGENT_AI_PROVIDER=nvidia` and `NVIDIA_API_KEY`; `AGENT_AI_PROVIDER=mock` does not require a key. See [.env.example](.env.example). Never commit credentials.

**The seed deletes existing agent demo data**, including reports and conversations, before creating the initial demo state. Run it only for a fresh setup or intentional reset:

```powershell
npm.cmd run db:seed
```

## Run the demo

Start these commands in three separate PowerShell terminals from the repository root:

```powershell
# Terminal 1: dashboard and agent
npm.cmd run dev
```

```powershell
# Terminal 2: Python backend
cd server
# Use the same private token configured in the root .env file.
# Also set AGENT_CREW_02_TOKEN through AGENT_CREW_05_TOKEN if configured explicitly.
$env:AGENT_DEMO_TOKEN = '<same token as in .env>'
.\.venv\Scripts\python.exe -m uvicorn aegis_data.api:create_app --factory --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 3: eyelid observation
npm.cmd --prefix feature-visione-palpebrale/vision-prototype run dev
```

Open the dashboard at `http://localhost:3000` or the agent demo at `http://localhost:3000/voice-demo`. The dashboard provides a synthetic data import for the demo. The Python API documentation is at `http://127.0.0.1:8000/docs`; the vision prototype runs at `http://127.0.0.1:5173`.

Prisma uses `prisma/dev.db` by default; the Python backend uses `server/data/aegis.sqlite3`. The Python process reads its own environment variables and does not automatically load the root `.env` file. On other operating systems, use `npm` and the corresponding Python virtual environment paths.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:agent
server\.venv\Scripts\python.exe -m pytest server/tests
npm.cmd --prefix feature-visione-palpebrale/vision-prototype test
```

## Further documentation

Some development documents are in Italian:

- [Data backend and API](docs/DATA_BACKEND.md) and [sleep analysis](docs/SLEEP_ANALYSIS.md).
- [Agent reports, schedules and API](docs/agent/report-and-schedule.md).
- [Eyelid observation](feature-visione-palpebrale/README.md) and [direct integration](docs/agent/i5-direct-vision.md).
- [Agent contracts](docs/agent/contracts-v1.md) and [archived planning documents](docs/archive/README.md).

The local demo identity mechanism is disabled in production, and the Python backend is intended for a trusted environment. Public deployment requires appropriate access controls and further integration work.
