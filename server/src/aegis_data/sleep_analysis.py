"""Reproducible, descriptive longitudinal sleep analysis. No model or speech code."""
import hashlib
import json
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from math import sqrt
from statistics import mean, median, pstdev

from .store import Store


def parse(value: str) -> datetime:
    return datetime.fromisoformat(value).astimezone(timezone.utc)


def validate_window(start: datetime, end: datetime) -> tuple[datetime, datetime]:
    if start.utcoffset() is None or end.utcoffset() is None:
        raise ValueError("start and end require a timezone")
    start, end = start.astimezone(timezone.utc), end.astimezone(timezone.utc)
    if not timedelta(0) < end - start <= timedelta(days=366):
        raise ValueError("analysis window must be positive and at most 366 days")
    return start, end


def correlation(pairs: list[dict]) -> float | None:
    if len(pairs) < 3:
        return None
    x = [p["sleep_hours"] for p in pairs]
    y = [p["fatigue_rating"] for p in pairs]
    dx = [v - mean(x) for v in x]
    dy = [v - mean(y) for v in y]
    denominator = sqrt(sum(v * v for v in dx) * sum(v * v for v in dy))
    return sum(a * b for a, b in zip(dx, dy)) / denominator if denominator else None


def analyze_sleep(store: Store, subject_id: str, start: datetime, end: datetime,
                  synthetic: bool = False) -> dict:
    start, end = validate_window(start, end)
    # Filter instruments by period_end, not ingestion time. Fetch feedback until
    # 24h beyond the requested window to match the final included episode.
    rows, truncated = store.list(subject_id, synthetic)
    measurements = [r for r in rows if r["kind"] == "sleep_measurement"
                    and start <= parse(r["period_end"]) < end]
    feedback = [r for r in rows if r["kind"] == "speech_feedback"
                and start <= parse(r["observed_at"]) < end + timedelta(hours=24)]
    reports = [r for r in feedback if r["quality"] == "valid" and r["basis"] == "self_report"
               and r["user_confirmed"] and r["fatigue_rating"] is not None]
    grouped = defaultdict(list)
    for row in measurements:
        if row["quality"] == "valid":
            grouped[(row["device_id"], row["method"])].append(row)

    days = (end - timedelta(microseconds=1)).date() - start.date()
    expected_days = days.days + 1
    groups = []
    for (device, method), observations in sorted(grouped.items()):
        # One representative episode per UTC end-date; latest-ending wins.
        # Overlapping windows cannot count twice, even across midnight.
        selected, seen_days = [], set()
        for row in sorted(observations, key=lambda r: (parse(r["period_end"]), r["recorded_at"], r["observation_id"]), reverse=True):
            day = parse(row["period_end"]).date()
            overlaps = any(parse(row["period_start"]) < parse(other["period_end"])
                           and parse(other["period_start"]) < parse(row["period_end"])
                           for other in selected)
            if day not in seen_days and not overlaps:
                selected.append(row)
                seen_days.add(day)
        selected.sort(key=lambda r: parse(r["period_end"]))
        series, pairs = [], []
        for index, row in enumerate(selected):
            ended = parse(row["period_end"])
            # Do not attribute feedback after the next episode begins to this one.
            cutoff = ended + timedelta(hours=24)
            if index + 1 < len(selected):
                cutoff = min(cutoff, parse(selected[index + 1]["period_start"]))
            candidates = [r for r in reports if ended <= parse(r["observed_at"]) < cutoff]
            report = max(candidates, key=lambda r: (parse(r["observed_at"]), r["observation_id"]), default=None)
            series.append({"day_utc": ended.date().isoformat(), "observation_id": row["observation_id"],
                           "period_start": row["period_start"], "period_end": row["period_end"],
                           "sleep_hours": row["sleep_hours"],
                           "sleep_latency_minutes": row.get("sleep_latency_minutes"),
                           "wake_after_sleep_onset_minutes": row.get("wake_after_sleep_onset_minutes"),
                           "awakenings_count": row.get("awakenings_count"),
                           "sleep_efficiency_percent": row.get("sleep_efficiency_percent"),
                           "sleep_stages": row.get("sleep_stages"),
                           "heart_rate_variability": row.get("heart_rate_variability"),
                           "feedback_id": report["observation_id"] if report else None})
            if report:
                pairs.append({"sleep_observation_id": row["observation_id"],
                              "feedback_observation_id": report["observation_id"],
                              "sleep_hours": row["sleep_hours"], "fatigue_rating": report["fatigue_rating"]})
        hours = [r["sleep_hours"] for r in series]
        x = [(parse(r["period_end"]) - parse(selected[0]["period_end"])).total_seconds() / 86400 for r in selected]
        denominator = sum((v - mean(x)) ** 2 for v in x)
        slope = (sum((a - mean(x)) * (b - mean(hours)) for a, b in zip(x, hours)) / denominator
                 if len(hours) >= 3 and denominator else None)
        missing = [(start.date() + timedelta(days=i)).isoformat() for i in range(expected_days)
                   if start.date() + timedelta(days=i) not in seen_days]
        groups.append({
            "device_id": device, "method": method,
            "summary": {"episode_count": len(hours), "mean_sleep_hours": mean(hours),
                        "median_sleep_hours": median(hours), "min_sleep_hours": min(hours),
                        "max_sleep_hours": max(hours), "duration_stddev_hours": pstdev(hours),
                        "sleep_quality": None},
            "coverage": {"expected_utc_days": expected_days, "days_with_episode": len(seen_days),
                         "missing_utc_days": missing, "fraction": len(seen_days) / expected_days,
                         "excluded_valid_episodes": len(observations) - len(selected)},
            "trend": {"status": "descriptive" if slope is not None else "insufficient_data",
                      "slope_hours_per_day": slope,
                      "direction": None if slope is None else "decreasing" if slope < -1e-9 else "increasing" if slope > 1e-9 else "stable",
                      "last_minus_first_hours": hours[-1] - hours[0] if len(hours) >= 2 else None},
            "feedback_comparison": {"pair_count": len(pairs), "pairs": pairs,
                                    "pearson_r": correlation(pairs),
                                    "interpretation": "association_only_not_causality"},
            "series": series,
        })

    result = {
        "rule_version": "sleep-analysis-demo-1", "subject_id": subject_id, "synthetic": synthetic,
        "range": {"start": start.isoformat(), "end_exclusive": end.isoformat()},
        "status": "partial_data" if truncated else "available" if groups else "insufficient_data",
        "truncated": truncated,
        "counts": {"instrument_episodes_in_window": len(measurements),
                   "invalid_episodes": sum(r["quality"] != "valid" for r in measurements),
                   "feedback_in_matching_window": len(feedback),
                   "eligible_confirmed_fatigue_reports": len(reports)},
        "groups": groups,
        "limits": ["Synthetic data are a demonstration, not NASA observations" if synthetic else "Personal observations only",
                   "Devices and methods are analyzed separately",
                   "One latest-ending, non-overlapping episode per UTC end-date; naps are not summed",
                   "Coverage is observed UTC dates, not verified sensor adherence",
                   "Duration variability is not sleep timing regularity or sleep quality",
                   "Trend and correlation are descriptive, not clinical conclusions",
                   "At least 3 episodes for trend and 3 nonconstant pairs for correlation",
                   "Feedback window is exploratory: at most 24h after sleep, before next episode starts",
                   "Latest confirmed fatigue report per episode; missing values remain missing"],
    }
    result["analysis_id"] = hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()
    return result
