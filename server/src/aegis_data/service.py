import hashlib
import json
from datetime import datetime
from statistics import median

from .store import Store
from .sleep_context import sleep_context

RULE_VERSION = "demo-1"


def vigilance_metrics(item: dict) -> dict:
    # Explicit demo definitions, not equivalence to validated PVT-B.
    responses = [t["rt_ms"] for t in item["trials"]
                 if t["status"] == "response" and t["rt_ms"] >= 100]
    false_starts = sum(t["status"] == "false_start" or
                       (t["status"] == "response" and t["rt_ms"] < 100)
                       for t in item["trials"])
    return {
        "median_rt_ms": median(responses) if responses else None,
        "response_count": len(responses),
        "false_start_count": false_starts,
        "missed_count": sum(t["status"] == "missed" for t in item["trials"]),
        "lapse_count": sum(rt >= 500 for rt in responses),
        "usable": item["quality"] == "valid" and len(responses) >= 5,
    }


class DataService:
    def __init__(self, store: Store):
        self.store = store

    def analyze_sleep(self, subject_id: str, start: datetime, end: datetime,
                      synthetic: bool = False) -> dict:
        from .sleep_analysis import analyze_sleep
        return analyze_sleep(self.store, subject_id, start, end, synthetic)

    def snapshot(self, subject_id: str, synthetic: bool = False,
                 start: datetime | None = None, end: datetime | None = None) -> dict:
        rows, truncated = self.store.list(subject_id, synthetic, start, end)
        sleep, mood, vigilance, measurements, feedback = [], [], [], [], []
        for row in rows:
            if row["kind"] == "sleep":
                sleep.append(row)
            elif row["kind"] == "mood":
                mood.append(row)
            elif row["kind"] == "sleep_measurement":
                measurements.append(row)
            elif row["kind"] == "speech_feedback":
                feedback.append(row)
            elif row["kind"] == "vigilance":
                # Raw trials stay in the observations API, not the LLM context.
                vigilance.append({k: v for k, v in row.items() if k != "trials"} |
                                 {"metrics": vigilance_metrics(row)})

        usable = [v for v in vigilance if v["metrics"]["usable"]]
        latest = usable[0] if usable else None
        # Compare only previous sessions on the same device and protocol.
        previous = [v for v in usable[1:] if latest and
                    v["protocol_id"] == latest["protocol_id"] and
                    v["device_id"] == latest["device_id"] and
                    v["observed_at"] < latest["observed_at"]][:5]
        baseline = median(v["metrics"]["median_rt_ms"] for v in previous) if len(previous) >= 3 else None
        delta = ((latest["metrics"]["median_rt_ms"] / baseline - 1) * 100
                 if baseline is not None else None)
        payload = {
            "schema_version": "1", "rule_version": RULE_VERSION,
            "subject_id": subject_id, "synthetic": synthetic,
            "as_of": max((r["recorded_at"] for r in rows), default=None),
            "range": {"start": start.isoformat() if start else None,
                      "end": end.isoformat() if end else None},
            "truncated": truncated,
            "sleep": sleep, "reported_mood": mood, "vigilance": vigilance,
            "sleep_measurements": measurements, "speech_feedback": feedback,
            "sleep_context": sleep_context(measurements, feedback),
            "comparison": {
                "status": "illustrative_comparison" if baseline is not None else "insufficient_data",
                "current_observation_id": latest["observation_id"] if latest else None,
                "baseline_observation_ids": [v["observation_id"] for v in previous],
                "baseline_median_rt_ms": baseline,
                "relative_change_pct": delta,
                "clinical_threshold": None,
            },
        }
        digest = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
        return {"snapshot_id": digest, **payload}
