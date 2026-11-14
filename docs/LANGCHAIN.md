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

I tool sono vincolati a soggetto e modalità sintetica alla creazione: questi parametri non sono esposti al modello. L'applicazione deve comunque autenticare l'utente e scegliere l'identità autorizzata prima di creare i tool. L'API attuale è destinata a un ambiente locale fidato e non implementa autenticazione.

Le risposte comprendono identificativi, provenienza, dati mancanti, etichette sintetiche e limiti. Non inviare trascrizioni o dati sanitari a servizi di tracing o provider esterni senza una scelta esplicita e le necessarie protezioni. La selezione del modello e la gestione della conversazione restano da concordare.
