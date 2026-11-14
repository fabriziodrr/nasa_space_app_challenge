# Integrazione LangChain con i dati AEGIS

La factory `create_data_tools` espone due strumenti di sola lettura, mantenendo i calcoli nel backend. Non implementa il compagno, un modello linguistico o il modulo voce: questi saranno integrati dal team.

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

La dashboard può usare gli endpoint esistenti `/v1/subjects/{subject_id}/agent-context` e `/v1/subjects/{subject_id}/sleep-analysis`; la factory Python serve all'agente in esecuzione nello stesso processo del servizio dati. Gli endpoint non costituiscono ancora un servizio conversazionale.

I tool sono vincolati a soggetto e modalità sintetica alla creazione: questi parametri non sono esposti al modello. L'applicazione deve comunque autenticare l'utente e scegliere l'identità autorizzata prima di creare i tool. L'API attuale è destinata a un ambiente locale fidato e non implementa autenticazione.

Le risposte comprendono identificativi, provenienza, dati mancanti, etichette sintetiche e limiti. Non inviare trascrizioni o dati sanitari a servizi di tracing o provider esterni senza una scelta esplicita e le necessarie protezioni. La selezione del modello e la gestione della conversazione restano da concordare.
