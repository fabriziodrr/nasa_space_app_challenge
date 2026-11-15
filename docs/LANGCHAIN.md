# LangChain integration with AEGIS data

The `create_data_tools` factory exposes two read-only tools. `companion.py` adds LangChain text orchestration; the voice module remains external.

From `server/`, install the optional extra if needed:

```powershell
.\.venv\Scripts\python.exe -m pip install -e ".[dev,agent]"
```

Example for the companion:

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

The `tools` list can be passed to the companion's LangChain agent. `get_context` accepts no arguments; `analyze_sleep` requires a timezone-aware interval, inclusive start and exclusive end. Invalid windows produce a validation error, to be handled in the agent flow.

The dashboard can use the existing endpoints `/v1/subjects/{subject_id}/agent-context` and `/v1/subjects/{subject_id}/sleep-analysis`. A test text endpoint is available as `POST /v1/demo/companion` with body `{"message":"Come ho dormito?","history":[]}`. It returns `response`, `subject_id` and `synthetic`; identity is fixed to `sleep-demo-14d` and synthetic data only. `history` is optional, with a maximum of 20 messages `{ "role": "user" | "assistant", "content": "..." }`; it is maintained by the caller, not saved by the backend.

To run the agent, a locally running Ollama, an already installed and tool-calling-compatible model, and an explicit choice before starting the backend are required: `$env:AEGIS_OLLAMA_MODEL = "nome-modello-installato"`. Inference is constrained to `127.0.0.1:11434`; no model is downloaded automatically. If unavailable, the endpoint responds 503 and the data APIs continue to work. The quality of a real model has not yet been verified.

## Vision linking in the demo

The Next/TypeScript app exposes `GET /api/agent/v1/sessions/{sessionId}/vision-selection`: it requires astronaut identity, verifies the session, and returns only the selected measurement, or `null`. Quality is recalculated according to the vision service configuration. The measurement must first be imported and selected in the vision path; the endpoint does not start the webcam.

The Python backend can add the read-only tool `get_selected_vision` to the agent. To enable it in the demo:

1. Start the agent Next on port 3000 and configure the demo as in [I5 — Visione diretta](agent/i5-direct-vision.md).
2. In the Python terminal, configure the same `AGENT_DEMO_TOKEN` used by Next and `AEGIS_OLLAMA_MODEL`, then start the Python backend on port 8000. Do not save tokens in tracked files.
3. Open a session in the Next demo, import and select a measurement. Keep its **session** identifier.
4. Call `POST /v1/demo/companion` with header `Authorization: Bearer <AGENT_DEMO_TOKEN>` and body:

```json
{"message":"Cosa mostrano i dati degli occhi e del sonno?", "vision_session_id":"ID_SESSIONE", "history":[]}
```

The Python backend contacts only `127.0.0.1:3000` with the demo token and verifies that the response belongs to the requested session. Without selection, the tool reports `not_selected`; if the service does not respond, it reports `unavailable`. The conversation can continue on available sleep data. The tool does not transfer images, video, or digests to the model.

The tool `get_integrated_context` composes sleep and vision while maintaining their respective metadata. To test it without a model, call `POST /v1/demo/integrated-context` with the same Bearer header and body `{"vision_session_id":"ID_SESSIONE"}`. See [SLEEP_DATA_SCHEMA.md](SLEEP_DATA_SCHEMA.md).

### Dedicated data agent

`data_agent.py` defines a LangGraph workflow: it collects context and builds a deterministic structured report. It does not call an LLM and does not modify data. The companion can invoke it through the LangChain tool `analyze_sensor_data` when a vision session is available. The report exposes sleep, confirmed feedback, vision status and quality, snapshot ID, and limits; `cross_source_conclusion` is always null until a verified common identity exists.

For the future dashboard, `POST /v1/demo/data-analysis` is available, with the same Bearer token and body `{"vision_session_id":"ID_SESSIONE"}`. The response keeps `synthetic`, `vision.status`, `vision.observation.usability`, and `identity_link` explicit. If vision is unavailable, the report still returns sleep with `vision.status=unavailable`. The demo boundaries already described apply: it is not a production endpoint or access to real personal data.

**Proof boundary:** the companion Python sleep still comes from the fixed synthetic subject `sleep-demo-14d`; vision can be webcam or synthetic and maintains its own label. They do not constitute a unified real history. The token and the link between the vision session and the sleep subject are demo-specific; common identity and authorization for real data are still to be designed. Do not interpret eyelid closure as a fatigue diagnosis.

Python components have been verified with simulated responses. Integration with the TypeScript server, webcam, Ollama model, and interface remains to be tested: the TypeScript development environment still requires dependency installation and Prisma generation.

Tools are bound to subject and synthetic mode at creation: these parameters are not exposed to the model. The application must still authenticate the user and choose the authorized identity before creating the tools. The current API is intended for a trusted local environment and does not implement authentication.

Responses include identifiers, provenance, missing data, synthetic labels, and limits. Do not send transcripts or health data to tracing services or external providers without an explicit choice and the necessary protections. Model selection and conversation management remain to be agreed.
