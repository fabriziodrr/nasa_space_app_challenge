# Base dati AEGIS

Questa prima implementazione contiene archivio SQLite, schemi validati, analytics deterministiche, API FastAPI e un adattatore di sola lettura per il compagno. Non include LLM, UI del test PVT, dashboard, voce, visione o sincronizzazione con Terra.

Estensione per dati strumentali del sonno e feedback continui dal modulo speech esterno: [SPEECH_DATA_CONTRACT.md](SPEECH_DATA_CONTRACT.md). Include i nuovi tipi `sleep_measurement` e `speech_feedback`, l'endpoint `/v1/speech-feedback` e il campo condiviso `sleep_context`.

Analisi longitudinale e prova sintetica di 14 giorni: [SLEEP_ANALYSIS.md](SLEEP_ANALYSIS.md). Sono disponibili anche l'importazione HTTP di un lotto JSON e lo strumento `analyze_sleep` per il compagno.

## Avvio locale

Repo di lavoro: `C:\Users\emanu\Desktop\Nasa_space\nasa_space_app_challenge`, branch `emanuel`. Il backend Python si trova in `server/`, separato dal frontend Next.js. Tutti i comandi seguenti si eseguono da quella cartella, con Python 3.12 o successivo:

```powershell
cd C:\Users\emanu\Desktop\Nasa_space\nasa_space_app_challenge\server
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m uvicorn aegis_data.api:create_app --factory --host 127.0.0.1 --port 8000
```

Se `py` non è configurato, usare il percorso del proprio `python.exe`. Installare le dipendenze richiede rete; l'esecuzione successiva usa risorse locali.

OpenAPI e interfaccia interattiva: `http://127.0.0.1:8000/docs`.

L'archivio predefinito è `data/aegis.sqlite3`, escluso da Git. Il percorso è configurabile con `AEGIS_DB_PATH`. Non inserire dati personali nei file tracciati.

**Confine dell'MVP:** API locale per un ambiente fidato, senza autenticazione, cifratura o autorizzazioni multiutente. Non esporre sulla rete o usare per il pannello a Terra prima di implementare questi controlli. La selezione `subject_id` nell'API non costituisce autorizzazione.

## Inserimento e importazione

`POST /v1/observations` accetta i tipi discriminati da `kind`: `sleep`, `mood`, `vigilance`, `sleep_measurement` e `speech_feedback`. I campi sconosciuti e i valori non validi sono rifiutati. I timestamp richiedono un fuso; `observed_at` è normalizzato in UTC.

- Sonno: `sleep_hours` da 0 a 24; `sleep_quality` intero 1–5 (molto scarsa, scarsa, discreta, buona, molto buona). Sono autovalutazioni.
- Umore: `mood_rating` intero 1–5 (molto negativo, negativo, neutro, positivo, molto positivo), `alertness` intero 1–10 (minima–massima), `confirmed: true`. Sono scale dimostrative non validate. Il modello non può registrare un'emozione inferita come autovalutazione confermata.
- Reattività: `protocol_id: aegis-pvt-demo-v1`, `device_id`, elenco `trials`. Ogni trial è `response` con `rt_ms`, oppure `false_start`/`missed` senza tempo.

Ogni osservazione include `subject_id`, `observed_at`, `synthetic` e `quality`. L'identificativo è generato se assente; il client dovrebbe conservarlo per evitare duplicazioni nei tentativi successivi. Un ID già presente dà HTTP 409: non viene sovrascritto. Non esiste ancora una procedura di rettifica/cancellazione: da definire prima di raccogliere dati personali reali.

Esempio sintetico completo in [examples/synthetic.json](../server/examples/synthetic.json). Importazione JSON atomica, senza trasformazioni nascoste e senza chiamate LLM:

```powershell
.\.venv\Scripts\python.exe -m aegis_data import examples/synthetic.json
```

Il file deve essere un array con 1–10.000 osservazioni. Errori di validazione o ID duplicati annullano l'intero inserimento. Il formato è intenzionalmente esplicito: CSV o dataset pubblici richiederanno un adattatore dopo averne visto colonne e protocollo. Nessun dataset NASA è incluso o spacciato per storia personale.

## Lettura e integrazione dell'agente

| Endpoint | Uso |
|---|---|
| `GET /health` | Verifica servizio |
| `GET /v1/subjects/{id}/observations` | Osservazioni, incluse prove grezze |
| `GET /v1/subjects/{id}/snapshot` | Serie e metriche per dashboard |
| `GET /v1/subjects/{id}/agent-context` | Contesto compatto per il compagno |

I dati sintetici sono esclusi per impostazione predefinita. Per l'esempio usare `subject_id=demo-astronaut` e `?synthetic=true`. Osservazioni e snapshot accettano `start`/`end` con fuso, estremi inclusi. Il recupero è limitato alle 1.000 osservazioni più recenti, segnalando `truncated`; non promette di rappresentare tutta la storia se supera il limite.

Snapshot e contesto condividono lo stesso `snapshot_id` a parità di archivio e filtri. L'ID cambia se i dati cambiano: due richieste separate possono quindi riferirsi a versioni diverse. Per allineamento rigoroso durante una conversazione, recuperare uno snapshot una volta e passarne la proiezione al compagno; lo storico degli snapshot non è ancora persistito. `as_of` è l'ultima acquisizione inclusa, non certifica che i sensori siano attuali: consultare anche `observed_at` e `quality`.

Integrazione Python senza dipendenza da LangChain:

```python
from aegis_data.store import Store
from aegis_data.service import DataService
from aegis_data.agent_tools import AgentDataTools

service = DataService(Store("data/aegis.sqlite3"))
# Identità e modalità sintetica decise dall'applicazione, mai dal prompt.
tools = AgentDataTools(service, subject_id="demo-astronaut", synthetic=True)
context = tools.get_context()
```

Il compagno del team può avvolgere `get_context()` come tool LangChain o chiamare l'endpoint HTTP. Non serve fornire al modello SQL, percorsi del DB o strumenti di scrittura. Il contesto non contiene audio o trascrizioni. La registrazione di un check-in rimane un'azione applicativa validata, dopo conferma dell'utente.

## Calcoli dimostrativi

Regola `demo-1`: tempi sotto 100 ms sono falsi avvii; risposte da 500 ms sono conteggiate come lapses; omissioni restano separate. Mediana sulle risposte da 100 ms in su. Una sessione è utilizzabile per il confronto se dichiarata valida e con almeno cinque risposte utilizzabili. Queste regole servono al wiring e ai test; non riproducono né validano da sole un PVT clinico.

Baseline dimostrativa: mediana delle mediane delle ultime 3–5 sessioni precedenti valide dello stesso soggetto, dispositivo e protocollo, nella finestra richiesta. Esclude la sessione corrente e la modalità sintetica opposta. Se manca storia, ritorna `insufficient_data` e valori nulli; nessuna soglia clinica o etichetta automatica di salute.

La sessione utilizzabile più recente può essere precedente a un test invalido più nuovo: gli ID e i timestamp lo rendono esplicito. Restano da implementare protocollo di acquisizione, rilevamento automatico di interruzioni, baseline scientificamente giustificata e confronto dei dispositivi.

## Verifica

```powershell
.\.venv\Scripts\python.exe -m pytest
```

I test coprono persistenza, isolamento dei soggetti e dei dati sintetici, import atomico, input invalidi, calcoli, provenienza della baseline e coerenza del contesto. Il test HTTP richiede FastAPI e httpx; viene segnalato come saltato se FastAPI non è disponibile.
