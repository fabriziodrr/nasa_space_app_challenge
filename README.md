# AEGIS — ISS Mission Dashboard

Prototipo dimostrativo per il monitoraggio di astronauti e il supporto alla sala di controllo. Comprende dashboard Next.js, agent conversazionale, dati sintetici del backend Python e osservazione palpebrale via webcam. I dati e le valutazioni della demo non sono strumenti diagnostici.

L'agent può generare un report e proporre modifiche alla schedule: l'applicazione delle proposte richiede l'approvazione della sala di controllo. Il test di reattività è disponibile come prototipo separato in `/reaction-demo`.

## Prerequisiti

- Node.js 24.15 o successivo della serie 24 e npm 11, richiesti anche dal prototipo di visione.
- Python 3.12 o successivo per il backend dati.
- Un browser con accesso alla webcam e, per la voce, al microfono.
- Una chiave NVIDIA per usare il modello reale; senza chiave è disponibile il provider `mock`.

I comandi seguenti sono per PowerShell, eseguiti dalla radice del progetto. Su altri sistemi usare i percorsi equivalenti per l'ambiente virtuale Python e `npm` al posto di `npm.cmd`.

## Configurazione iniziale

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

Modificare `.env` localmente: impostare `AGENT_DEMO_ENABLED=true` e un `AGENT_DEMO_TOKEN` privato di almeno 16 caratteri. Per il modello NVIDIA impostare `AGENT_AI_PROVIDER=nvidia` e `NVIDIA_API_KEY`; `mock` non richiede una chiave. I valori disponibili sono documentati in [.env.example](.env.example). Non condividere `.env` o le chiavi.

**Il seed cancella i dati dell'agent esistenti**, inclusi report e conversazioni, e li sostituisce con dati demo. Eseguirlo solo per inizializzare o resettare volontariamente la demo:

```powershell
npm.cmd run db:seed
```

## Avvio locale

Avviare i tre servizi in terminali separati:

```powershell
# Terminale 1: dashboard e agent
npm.cmd run dev
```

```powershell
# Terminale 2: backend Python, dalla radice del progetto
cd server
# Impostare la stessa chiave AGENT_DEMO_TOKEN configurata nel file .env della root.
# Impostare anche AGENT_CREW_02_TOKEN ... AGENT_CREW_05_TOKEN se configurati esplicitamente.
$env:AGENT_DEMO_TOKEN = '<lo stesso token della root>'
.\.venv\Scripts\python.exe -m uvicorn aegis_data.api:create_app --factory --host 127.0.0.1 --port 8000
```

```powershell
# Terminale 3: visione palpebrale
npm.cmd --prefix feature-visione-palpebrale/vision-prototype run dev
```

La dashboard è su `http://localhost:3000`; la demo dell'agent è su `http://localhost:3000/voice-demo`. La documentazione del backend Python è su `http://127.0.0.1:8000/docs` e il prototipo di visione su `http://127.0.0.1:5173`. La dashboard consente di caricare i dati sintetici per la demo.

I due database locali sono distinti: Prisma usa `prisma/dev.db`, mentre il servizio Python usa `server/data/aegis.sqlite3`. Il backend Python legge le proprie variabili dall'ambiente del processo, non automaticamente dal `.env` nella root.

## Verifiche

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:agent
server\.venv\Scripts\python.exe -m pytest server/tests
npm.cmd --prefix feature-visione-palpebrale/vision-prototype test
```

## Documentazione

- [Backend dati e API](docs/DATA_BACKEND.md) e [analisi del sonno](docs/SLEEP_ANALYSIS.md).
- [Report, schedule e API dell'agent](docs/agent/report-and-schedule.md).
- [Visione palpebrale](feature-visione-palpebrale/README.md) e [integrazione diretta](docs/agent/i5-direct-vision.md).
- [Contratti dell'agent](docs/agent/contracts-v1.md), [piano iniziale](AGENT_FEATURE_PLAN.md) e [piano di integrazione della visione](VISION_AGENT_INTEGRATION_PLAN.md).

## Stato del deploy

La configurazione descritta è locale: l'identità demo è disabilitata in produzione e il backend Python è pensato per un ambiente fidato. La [guida alla migrazione Supabase](docs/SUPABASE_MIGRATION.md) descrive il supporto PostgreSQL e la copia dei due archivi. Per una pubblicazione occorrono anche configurazione degli indirizzi e un sistema di accesso adeguato.
