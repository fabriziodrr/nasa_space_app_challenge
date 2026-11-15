# Sleep analysis and demo test

## Available function

`GET /v1/subjects/{subject_id}/sleep-analysis` produces a deterministic result, usable by the dashboard or the companion. No speech component or AI model is executed.

Required parameters: `start` and `end`, timestamps with time zone. The window is `[start, end)`, up to 366 days. `synthetic` is `false` by default; for the test it must be set to `true`.

The result contains:

- `analysis_id`: hash of the result and selected observations, useful for identifying the shared report.
- Availability status and `partial_data` indication if retrieval exceeds the service limit of 1,000 observations.
- Distinct groups by device and method, without mixing measurements.
- Series with duration and episode IDs and associated feedback.
- Mean, median, extremes, and standard deviation of duration.
- UTC day coverage, missing days, and number of excluded episodes.
- Duration slope over time, direction, and difference between last and first episode.
- Sleep/fatigue reported pairs and eventual descriptive Pearson correlation.

For each group, one episode per UTC day of sleep end is selected: the one ending latest prevails; overlapping windows are not counted twice. It is not an inclusive daily total including naps. Coverage describes episode presence, not actual sensor adherence.

Measures are filtered by episode end, not by import time. Associated feedback is the last valid, referenced, and confirmed fatigue value within 24 hours after sleep end and before the start of the next selected episode. One pair per episode avoids giving more weight to days with more conversations.

Trend requires at least three episodes. Correlation requires at least three pairs and variability in both variables; otherwise it returns `null`. No significance, causality, or diagnosis is calculated. Duration deviation does not measure schedule regularity; sleep quality is not invented from duration.

## Ready-to-use test

File: [sleep_demo_14d.json](../server/examples/sleep_demo_14d.json). There are **27 fully synthetic observations**, with subject ID `sleep-demo-14d`, from November 1 to 14, 2026. They are not NASA data or real astronaut measurements.

The scenario is designed to show progressively shorter duration and increasing reported fatigue. The relationship is deliberately designed: its correlation value is not a scientific result.

From PowerShell in the `server/` folder:

```powershell
.\.venv\Scripts\python.exe -m aegis_data import examples/sleep_demo_14d.json
```

A second import of the same IDs returns a duplicate error without modifying the database. It is not necessary to import again after the first load.

Alternatively, with the server running, the file can be loaded via API:

```powershell
Invoke-RestMethod -Uri 'http://127.0.0.1:8000/v1/observations/import' -Method Post -ContentType 'application/json' -InFile '.\examples\sleep_demo_14d.json'
```

HTTP import is atomic: duplicates or invalid input prevent batch insertion. Local access limitations documented in [DATA_BACKEND.md](DATA_BACKEND.md) still apply.

## Viewing the result

After restarting the server, open `/docs` and select the `sleep-analysis` endpoint:

| Field | Demo value |
|---|---|
| `subject_id` | `sleep-demo-14d` |
| `start` | `2026-11-01T00:00:00Z` |
| `end` | `2026-11-15T00:00:00Z` |
| `synthetic` | `true` |

Or open directly:

[Local demo analysis](http://127.0.0.1:8000/v1/subjects/sleep-demo-14d/sleep-analysis?start=2026-11-01T00%3A00%3A00Z&end=2026-11-15T00%3A00%3A00Z&synthetic=true)

Expected results:

- 13 instrumental episodes received, one invalid; 12 episodes analyzed.
- 14 expected days, with no usable measurement on November 7 and 11.
- Average duration about 6.74 hours; decreasing trend.
- 12 sleep/fatigue pairs; inferred feedback is not used.
- With `synthetic=false` the same subject has no real data.

The generator [generate_sleep_demo.py](../server/examples/generate_sleep_demo.py) reproduces the file, without modifying the database.

## Agent connection

The companion can call the endpoint or `AgentDataTools.analyze_sleep(start, end)`. Subject identity and synthetic mode are fixed by the trusted application during adapter construction.

The response can be explained by the model, which must keep synthetic label, coverage, period, and limits. The dashboard consumes the same numeric result. The analysis is not automatically inserted into every turn: the agent requests it when useful and with an explicit interval.
