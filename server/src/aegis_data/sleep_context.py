"""Descriptive cross-reference; does not diagnose tiredness from sleep duration."""
from datetime import datetime
from statistics import median


def sleep_context(measurements: list[dict], feedback: list[dict]) -> dict:
    valid = [r for r in measurements if r["quality"] == "valid"]
    latest = valid[0] if valid else None
    previous = []
    if latest:
        start = datetime.fromisoformat(latest["period_start"])
        previous = [r for r in valid[1:]
                    if r["device_id"] == latest["device_id"] and r["method"] == latest["method"]
                    and datetime.fromisoformat(r["period_end"]) <= start][:5]
    reference = median(r["sleep_hours"] for r in previous) if len(previous) >= 3 else None

    # Unconfirmed reports and model inferences remain visible in history,
    # but cannot become confirmed evidence through aggregation.
    reports = [r for r in feedback if r["quality"] == "valid"
               and r["basis"] == "self_report" and r["user_confirmed"]]
    report = reports[0] if reports else None
    alignment = "insufficient_data"
    if latest and report:
        gap = (datetime.fromisoformat(report["observed_at"]) -
               datetime.fromisoformat(latest["period_end"])).total_seconds() / 3600
        alignment = "within_demo_window" if 0 <= gap <= 24 else "different_periods"
    return {
        "latest_measurement": latest,
        "latest_confirmed_feedback": report,
        "personal_reference": {
            "status": "illustrative_comparison" if reference is not None else "insufficient_data",
            "observation_ids": [r["observation_id"] for r in previous],
            "median_sleep_hours": reference,
            "change_hours": latest["sleep_hours"] - reference if reference is not None else None,
        },
        "feedback_alignment": alignment,
        "alignment_window_hours": 24,
        "rule_version": "sleep-context-demo-1",
        "fatigue_diagnosis": None,
        "limits": [
            "Duration alone does not determine tiredness or sleep quality",
            "Temporal proximity does not establish causality",
            "Check timestamps: this is historical context, not a current health assessment",
            "Reference and alignment window are exploratory prototype rules",
        ],
    }
