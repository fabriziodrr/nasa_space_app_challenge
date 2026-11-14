"""Generate explicitly fictional data, with gaps and invalid/inferred records."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path


def build_demo():
    rows = []
    hours = [7.8, 7.6, 7.9, 7.4, 7.7, 7.3, None, 6.9, 6.5, 6.1, 5.8, 5.5, 5.2, 5.0]
    fatigue = [2, 2, 2, 3, 2, 3, None, 4, 5, 6, 7, 8, 8, 9]
    for day, (duration, rating) in enumerate(zip(hours, fatigue), 1):
        if duration is None:
            continue
        end = datetime(2026, 11, day, 8, tzinfo=timezone.utc)
        rows.append({
            "kind": "sleep_measurement", "observation_id": f"sleep-demo-14d-night-{day:02d}",
            "subject_id": "sleep-demo-14d", "observed_at": end.isoformat(),
            "synthetic": True, "quality": "invalid" if day == 11 else "valid",
            "source": "instrument", "device_id": "simulated-watch-14d",
            "method": "fictional-actigraphy", "period_start": (end - timedelta(hours=10)).isoformat(),
            "period_end": end.isoformat(), "sleep_hours": duration,
        })
        rows.append({
            "kind": "speech_feedback", "observation_id": f"sleep-demo-14d-report-{day:02d}",
            "subject_id": "sleep-demo-14d", "observed_at": (end + timedelta(hours=1)).isoformat(),
            "synthetic": True, "turn_id": f"fictional-turn-{day:02d}",
            "basis": "self_report", "user_confirmed": True, "fatigue_rating": rating,
        })
    rows.append({
        "kind": "speech_feedback", "observation_id": "sleep-demo-14d-inference",
        "subject_id": "sleep-demo-14d", "observed_at": "2026-11-14T10:00:00+00:00",
        "synthetic": True, "turn_id": "fictional-inference-turn",
        "basis": "model_inference", "user_confirmed": False, "fatigue_rating": 1,
    })
    return rows


if __name__ == "__main__":
    path = Path(__file__).with_name("sleep_demo_14d.json")
    path.write_text(json.dumps(build_demo(), indent=2) + "\n", encoding="utf-8")
    print(f"Written {len(build_demo())} synthetic observations to {path.name}")
