# Integrazione LangChain con i dati AEGIS

La factory `create_data_tools` espone due strumenti di sola lettura. `companion.py` aggiunge l'orchestrazione testuale LangChain; il modulo voce rimane esterno.

Da `server/`, installare l'extra opzionale se necessario:

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[dev,agent]"
```

Esempio per il compagno:

```python
from aegis_data.store import Store
from aegis_data.service import DataService
from aegis_data.langchain_tools import create_data_tools

service = DataService(Store("data/aegis.sqlite3"))
# Identità scelta dal codice dell'applicazione, non dal modello.
tools = create_data_tools(service, subject_id="sleep-demo-14d", synthetic=True)
by_name = {tool.name: tool for tool in tools}

context = by_name["get_context"].invoke({})
analysis = by_name["analyze_sleep"].invoke({
    "start": "2026-11-01T00:00:00Z",
    "end": "2026-11-15T00:00:00Z",
})
```

La lista `tools` può essere passata all'agente LangChain del compagno. `get_context` non accetta argomenti; `analyze_sleep` richiede un intervallo con fuso, inizio incluso e fine esclusa. Finestre invalide producono un errore di validazione, da gestire nel flusso dell'agente.

La dashboard può usare gli endpoint esistenti `/v1/subjects/{subject_id}/agent-context` e `/v1/subjects/{subject_id}/sleep-analysis`. Un endpoint testuale di prova è disponibile come `POST /v1/demo/companion` con corpo `{"message":"Come ho dormito?","history":[]}`. Restituisce `response`, `subject_id` e `synthetic`; l'identità è fissata a `sleep-demo-14d` e ai soli dati sintetici. `history` è opzionale, con massimo 20 messaggi `{ "role": "user" | "assistant", "content": "..." }`; la mantiene il chiamante, non viene salvata dal backend.

Per eseguire l'agente serve Ollama locale avviato, un modello già installato e compatibile con tool calling, e una scelta esplicita prima di avviare il backend: `$env:AEGIS_OLLAMA_MODEL = "nome-modello-installato"`. L'inferenza è vincolata a `127.0.0.1:11434`; non viene scaricato alcun modello automaticamente. Se non disponibile, l'endpoint risponde 503 e le API dati continuano a funzionare. Non è stata ancora verificata la qualità di un modello reale.

## Collegamento vision nella demo

L'app Next/TypeScript espone `GET /api/agent/v1/sessions/{sessionId}/vision-selection`: richiede l'identità astronauta, verifica la sessione e restituisce soltanto la misura selezionata, oppure `null`. La qualità viene ricalcolata secondo la configurazione del servizio vision. La misura deve essere prima importata e selezionata nel percorso vision; l'endpoint non avvia la webcam.

Il backend Python può aggiungere all'agente il tool di sola lettura `get_selected_vision`. Per abilitarlo nella demo:

1. Avviare l'agent Next sulla porta 3000 e configurare la demo come in [I5 — Visione diretta](agent/i5-direct-vision.md).
2. Nel terminale Python configurare lo stesso `AGENT_DEMO_TOKEN` usato da Next e `AEGIS_OLLAMA_MODEL`, poi avviare il backend Python sulla porta 8000. Non salvare token nei file tracciati.
3. Aprire una sessione nella demo Next, importare e selezionare una misura. Conservare il suo identificativo di **sessione**.
4. Chiamare `POST /v1/demo/companion` con header `Authorization: Bearer <AGENT_DEMO_TOKEN>` e corpo:

```json
{"message":"Cosa mostrano i dati degli occhi e del sonno?", "vision_session_id":"ID_SESSIONE", "history":[]}
```

Il backend Python contatta solo `127.0.0.1:3000` con il token demo e verifica che la risposta appartenga alla sessione richiesta. Senza selezione il tool riporta `not_selected`; se il servizio non risponde riporta `unavailable`. La conversazione può proseguire sui dati del sonno disponibili. Il tool non trasferisce immagini, video o digest al modello.

Il tool `get_integrated_context` compone sonno e vision mantenendo i rispettivi metadati. Per testarlo senza modello, chiamare `POST /v1/demo/integrated-context` con lo stesso header Bearer e corpo `{"vision_session_id":"ID_SESSIONE"}`. Vedere [SLEEP_DATA_SCHEMA.md](SLEEP_DATA_SCHEMA.md).

### Agente dati dedicato

`data_agent.py` definisce un workflow LangGraph: raccoglie il contesto e costruisce un rapporto strutturato deterministico. Non chiama un LLM e non modifica dati. Il compagno può invocarlo attraverso il tool LangChain `analyze_sensor_data` quando è disponibile una sessione vision. Il rapporto espone sonno, feedback confermati, stato e qualità vision, ID dello snapshot e limiti; `cross_source_conclusion` è sempre nullo finché non esiste un'identità comune verificata.

Per la futura dashboard è disponibile `POST /v1/demo/data-analysis`, con lo stesso token Bearer e corpo `{"vision_session_id":"ID_SESSIONE"}`. La risposta mantiene espliciti `synthetic`, `vision.status`, `vision.observation.usability` e `identity_link`. Se la vision è indisponibile, il report restituisce comunque il sonno con `vision.status=unavailable`. Si applicano i confini demo già descritti: non è un endpoint di produzione o un accesso a dati personali reali.

**Confine della prova:** il sonno del companion Python proviene ancora dal soggetto sintetico fisso `sleep-demo-14d`; la vision può essere webcam o sintetica e mantiene la propria etichetta. Non costituiscono una storia reale unificata. Il token e il legame tra la sessione vision e il soggetto di sonno sono specifici della demo; identità comune e autorizzazione per dati reali sono ancora da progettare. Non interpretare la chiusura palpebrale come diagnosi di fatica.

Sono stati verificati i componenti Python con risposte simulate. Rimangono da collaudare insieme server TypeScript, webcam, modello Ollama e interfaccia: l'ambiente di sviluppo TypeScript richiede ancora installazione delle dipendenze e generazione Prisma.

I tool sono vincolati a soggetto e modalità sintetica alla creazione: questi parametri non sono esposti al modello. L'applicazione deve comunque autenticare l'utente e scegliere l'identità autorizzata prima di creare i tool. L'API attuale è destinata a un ambiente locale fidato e non implementa autenticazione.

Le risposte comprendono identificativi, provenienza, dati mancanti, etichette sintetiche e limiti. Non inviare trascrizioni o dati sanitari a servizi di tracing o provider esterni senza una scelta esplicita e le necessarie protezioni. La selezione del modello e la gestione della conversazione restano da concordare.
