# AEGIS — Data Management and Research Source Integration

**Status:** integration plan; research catalog and archive not yet implemented.

The existing operational base is described in [DATA_BACKEND.md](DATA_BACKEND.md). Before adapting schemas, verify the datasets actually available, their columns, and access conditions.

## 1. Three types of data

| Type | Content | Use |
|---|---|---|
| Personal observations | Check-ins, response tests, and future signals acquired from the user | Personal dashboard and companion context |
| Research data | Published files with their own subjects, protocols, and variables | Exploration, transformation verification, and explicit research comparisons |
| Synthetic data | Examples built for tests and demos | Flow demonstration, always labeled |

A scientific publication is a source of evidence, not necessarily an available dataset. A catalog record without accessible files must not be presented as imported data.

Research data must not automatically enter the personal history, baseline, or companion context. The personal baseline is built from sessions of the same user collected under comparable conditions.

## 2. Initial boundary between archives

For the first import, we propose a research archive separate from the current operational SQLite. Personal endpoints remain connected only to the operational archive. Physical separation makes it verifiable that a study import does not modify user history.

The single `synthetic` field is not sufficient today to identify real research data: `false` does not necessarily mean personal data. The future research archive must use dataset and participant identifiers in its own namespace.

We do not add a clinical model, population thresholds, or a training process just because a dataset is available: every use requires an appropriate question and variables.

## 3. Ingestion path

1. **Catalog:** register official identifier, title, URL, optional DOI, population, accessibility, version, and terms of use.
2. **Acquire:** preserve the original file unmodified; record acquisition date and SHA-256 hash. Do not version large files or personal data in Git.
3. **Inspect:** describe columns, units, scales, frequency, number of subjects, missing values, and collection protocol.
4. **Map:** create a specific, versioned adapter, preserving original field and applied transformation.
5. **Validate:** reject or quarantine inconsistent rows, producing an import report; do not delete them silently.
6. **Store:** atomically import accepted rows into the research archive. Identifiers and hashes prevent involuntary duplication.
7. **Expose:** offer dedicated views for research data, with visible provenance and without mixing them with personal parameters.

Before downloading, check any restrictions or attribution obligations: web accessibility does not automatically equal a license for unrestricted reuse.

## 4. Minimum provenance

For each import: `dataset_id`, `source_url`, `source_version`, `retrieved_at`, `file_sha256`, `adapter_version`, terms of use, and validation report.

For each row: original pseudonymized subject identifier, file and original location, measure, value, unit or scale, temporal reference, acquisition method, quality, and transformations.

A mission day or relative time must not become an invented UTC timestamp. Keep the original temporal reference until a documented conversion is available.

## 5. Rules for sleep, mood, and responsiveness

- **Sleep:** separate reported duration, actigraphy measures, and any sleep stages. Duration is not quality. If a quality scale is missing, keep it absent.
- **Mood:** keep original scale name and anchors. Stress, sleepiness, and mood are distinct variables; do not automatically convert them to the current `mood_rating` 1–10.
- **Responsiveness:** preserve protocol, duration, device, trial, and lapse/false start definitions when available. A published average or statistic does not allow reconstruction of individual trials.
- **Availability:** a dataset may cover only one of the dimensions. Do not invent the others to complete a demo.
- **Population:** distinguish astronauts, analog participants, and terrestrial volunteers. A subject from one study does not correspond to a subject from another study.

## 6. Current schema limitations

Operational schemas are adequate for the first example, but are not yet a universal research format:

- Sleep requires both duration and quality; a study may publish only one.
- Mood also requires alertness; these measures may be collected at different times.
- Responsiveness accepts only `aegis-pvt-demo-v1`; do not assign it to NASA tests with a different protocol.
- Current import accepts absolute timestamps with time zone; some studies use relative times.

Adapters must therefore be designed after data inspection. Do not force the dataset into current schemas through invented values or unjustified conversions.

## 7. What the companion receives

In the personal path, the companion receives the active subject snapshot, quality and provenance of measures, data availability, and comparison limits. Missing information must remain explicit.

A possible research tool is separate and also returns dataset, population, and protocol. If a comparison with a study is shown, it must be called a research comparison and not a personal baseline or health judgment.

The LLM can explain already calculated results. It does not autonomously choose which studies or subjects to mix and does not perform invisible numerical transformations to the dashboard.

## 8. Criterion for choosing the first dataset

Priority to a dataset with actually accessible files, data dictionary, verifiable terms of use, and at least one variable useful for sleep or responsiveness. The presence of longitudinal data and stable pseudonymized identifiers enables within-subject analysis.

Better to complete a reproducible import of a single dimension than to promise sleep, mood, and responsiveness coverage not present in the files. If only metadata or controlled access exist, document it and keep labeled synthetic examples.
