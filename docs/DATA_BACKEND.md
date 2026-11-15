# AEGIS Database

The data backend contains a separate SQLite archive, validated schemas, deterministic analytics, and FastAPI APIs. The project also includes dashboard, agent, and vision as separate components: for their integrated startup see the [main README](../README.md). The responsiveness test remains a separate prototype.

Extension for instrumental sleep data and continuous feedback from the external speech module: [SPEECH_DATA_CONTRACT.md](SPEECH_DATA_CONTRACT.md). Includes the new types `sleep_measurement` and `speech_feedback`, the endpoint `/v1/speech-feedback`, and the shared field `sleep_context`.

Longitudinal analysis and 14-day synthetic proof: [SLEEP_ANALYSIS.md](SLEEP_ANALYSIS.md). HTTP import of a JSON batch and the `analyze_sleep` tool for the companion are also available.

## Local startup

The Python backend is located in `server/`, separate from the Next.js frontend. From the clone root, with Python 3.12 or later:

```powershell
cd server
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m uvicorn aegis_data.api:create_app --factory --host 127.0.0.1 --port 8000
```

If `py` is not configured, use your own `python.exe` path. Installing dependencies requires network; subsequent execution uses local resources.

OpenAPI and interactive interface: `http://127.0.0.1:8000/docs`.

The default archive is `data/aegis.sqlite3`, excluded from Git. The path is configurable with `AEGIS_DB_PATH`. Do not put personal data in tracked files.

**MVP boundary:** local API for a trusted environment, without authentication, encryption, or multi-user authorization. Do not expose on the network or use for the ground panel before implementing these controls. The `subject_id` selection in the API does not constitute authorization.

## Insertion and import

`POST /v1/observations` accepts types discriminated by `kind`: `sleep`, `mood`, `vigilance`, `sleep_measurement`, and `speech_feedback`. Unknown fields and invalid values are rejected. Timestamps require a timezone; `observed_at` is normalized to UTC.

- Sleep: `sleep_hours` from 0 to 24; `sleep_quality` integer 1–10, from very poor to very good. These are self-assessments.
- Mood: `mood_rating` integer 1–10, from very negative to very positive, `alertness` integer 1–10 (minimum–maximum), `confirmed: true`. These are demonstrative non-validated scales. The model cannot record an inferred emotion as a confirmed self-assessment.

For new `sleep` and `mood`, `scale_max: 10` is mandatory. For `speech_feedback` with mood, `mood_scale_max: 10` is mandatory; feedback without mood does not require that field. Previous clients must be updated. Records already saved without scale indication remain queryable with scale `null` and are not converted.
- Responsiveness: `protocol_id: aegis-pvt-demo-v1`, `device_id`, list of `trials`. Each trial is `response` with `rt_ms`, or `false_start`/`missed` without time.

Each observation includes `subject_id`, `observed_at`, `synthetic`, and `quality`. The identifier is generated if absent; the client should keep it to avoid duplication on subsequent retries. An already present ID gives HTTP 409: it is not overwritten. No correction/deletion procedure exists yet: to be defined before collecting real personal data.

Complete synthetic example in [examples/synthetic.json](../server/examples/synthetic.json). Atomic JSON import, no hidden transformations, no LLM calls:

```powershell
.\.venv\Scripts\python.exe -m aegis_data import examples/synthetic.json
```

The file must be an array with 1–10,000 observations. Validation errors or duplicate IDs cancel the entire insertion. The format is intentionally explicit: CSV or public datasets will require an adapter after inspecting columns and protocol. No NASA dataset is included or passed off as personal history.

## Reading and agent integration

| Endpoint | Use |
|---|---|
| `GET /health` | Service check |
| `GET /v1/subjects/{id}/observations` | Observations, including raw trials |
| `GET /v1/subjects/{id}/snapshot` | Series and metrics for dashboard |
| `GET /v1/subjects/{id}/agent-context` | Compact context for the companion |

Synthetic data are excluded by default. For the example use `subject_id=demo-astronaut` and `?synthetic=true`. Observations and snapshot accept `start`/`end` with timezone, inclusive bounds. Retrieval is limited to the 1,000 most recent observations, signaling `truncated`; it does not promise to represent the entire history if it exceeds the limit.

Snapshot and context share the same `snapshot_id` for the same archive and filters. The ID changes if data change: two separate requests can therefore refer to different versions. For strict alignment during a conversation, retrieve a snapshot once and pass its projection to the companion; snapshot history is not yet persisted. `as_of` is the last acquisition included, it does not certify that sensors are current: also consult `observed_at` and `quality`.

Python integration without LangChain dependency:

```python
from aegis_data.store import Store
from aegis_data.service import DataService
from aegis_data.agent_tools import AgentDataTools

service = DataService(Store("data/aegis.sqlite3"))
# Identità e modalità sintetica decise dall'applicazione, mai dal prompt.
tools = AgentDataTools(service, subject_id="demo-astronaut", synthetic=True)
context = tools.get_context()
```

The team companion can wrap `get_context()` as a LangChain tool or call the HTTP endpoint. There is no need to provide the model with SQL, DB paths, or write tools. The context does not contain audio or transcripts. Recording a check-in remains a validated application action, after user confirmation.

## Demonstrative calculations

Rule `demo-1`: times under 100 ms are false starts; responses from 500 ms are counted as lapses; omissions remain separate. Median on responses from 100 ms upward. A session is usable for comparison if declared valid and with at least five usable responses. These rules serve wiring and tests; they do not reproduce nor validate by themselves a clinical PVT.

Demonstrative baseline: median of medians of the last 3–5 previous valid sessions of the same subject, device, and protocol, within the requested window. Excludes the current session and opposite synthetic mode. If history is missing, it returns `insufficient_data` and null values; no clinical threshold or automatic health label.

The most recent usable session may precede a newer invalid test: IDs and timestamps make this explicit. Acquisition protocol, automatic interruption detection, scientifically justified baseline, and device comparison remain to be implemented.

## Verification

```powershell
.\.venv\Scripts\python.exe -m pytest
```

Tests cover persistence, subject and synthetic data isolation, atomic import, invalid inputs, calculations, baseline provenance, and context consistency. The HTTP test requires FastAPI and httpx; it is reported as skipped if FastAPI is not available.
