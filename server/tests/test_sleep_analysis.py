import importlib.util
from datetime import datetime, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from aegis_data.agent_tools import AgentDataTools
from aegis_data.api import create_app
from aegis_data.service import DataService
from aegis_data.store import Store

START = datetime(2026, 11, 1, tzinfo=timezone.utc)
END = datetime(2026, 11, 15, tzinfo=timezone.utc)


def demo_rows():
    spec = importlib.util.spec_from_file_location("demo", Path(__file__).parents[1] / "examples/generate_sleep_demo.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.build_demo()


@pytest.fixture
def service(tmp_path):
    store = Store(tmp_path / "analysis.sqlite3")
    store.add_many(demo_rows())
    return DataService(store)


def test_demo_coverage_trend_feedback_and_identity(service):
    result = service.analyze_sleep("sleep-demo-14d", START, END, True)
    assert result["synthetic"] is True
    group = result["groups"][0]
    assert group["summary"]["episode_count"] == 12
    assert group["summary"]["mean_sleep_hours"] == pytest.approx(80.9 / 12)
    assert group["summary"]["sleep_quality"] is None
    assert group["coverage"]["missing_utc_days"] == ["2026-11-07", "2026-11-11"]
    assert group["trend"]["direction"] == "decreasing"
    assert group["feedback_comparison"]["pair_count"] == 12
    assert group["feedback_comparison"]["pearson_r"] < -0.9
    assert all(p["feedback_observation_id"] != "sleep-demo-14d-inference"
               for p in group["feedback_comparison"]["pairs"])
    assert result["counts"]["invalid_episodes"] == 1
    tools = AgentDataTools(service, "sleep-demo-14d", synthetic=True)
    assert tools.analyze_sleep(START, END)["analysis_id"] == result["analysis_id"]
    assert service.analyze_sleep("sleep-demo-14d", START, END)["status"] == "insufficient_data"
    assert service.analyze_sleep("another-subject", START, END, True)["groups"] == []


def test_end_is_exclusive_and_sparse_data_have_no_invented_trend(service):
    result = service.analyze_sleep("sleep-demo-14d", START, datetime(2026, 11, 2, tzinfo=timezone.utc), True)
    group = result["groups"][0]
    assert group["summary"]["episode_count"] == 1
    assert group["trend"]["slope_hours_per_day"] is None
    assert group["feedback_comparison"]["pearson_r"] is None


def test_overlapping_duplicates_and_device_groups_are_not_pooled(tmp_path):
    rows = [r for r in demo_rows() if r["kind"] == "sleep_measurement"][:3]
    rows.append(rows[0] | {"observation_id": "duplicate-window", "sleep_hours": 1})
    rows.append(rows[0] | {"observation_id": "other-device", "device_id": "other-watch"})
    store = Store(tmp_path / "separate.sqlite3")
    store.add_many(rows)
    result = DataService(store).analyze_sleep("sleep-demo-14d", START, END, True)
    assert len(result["groups"]) == 2
    assert sorted(g["summary"]["episode_count"] for g in result["groups"]) == [1, 3]
    assert sum(g["coverage"]["excluded_valid_episodes"] for g in result["groups"]) == 1


def test_constant_feedback_does_not_produce_correlation(tmp_path):
    rows = demo_rows()
    for row in rows:
        if row["kind"] == "speech_feedback":
            row["fatigue_rating"] = 5
    store = Store(tmp_path / "constant.sqlite3")
    store.add_many(rows)
    result = DataService(store).analyze_sleep("sleep-demo-14d", START, END, True)
    assert result["groups"][0]["feedback_comparison"]["pearson_r"] is None


def test_http_import_rollback_analysis_and_invalid_window(tmp_path):
    with TestClient(create_app(tmp_path / "http.sqlite3")) as client:
        response = client.post("/v1/observations/import", json=demo_rows())
        assert response.status_code == 201
        assert response.json() == {"imported": 27, "synthetic_count": 27}
        fresh = demo_rows()[0] | {"observation_id": "must-be-rolled-back"}
        assert client.post("/v1/observations/import", json=[fresh, demo_rows()[0]]).status_code == 409
        params = {"start": START.isoformat(), "end": END.isoformat(), "synthetic": True}
        result = client.get("/v1/subjects/sleep-demo-14d/sleep-analysis", params=params)
        assert result.status_code == 200
        assert result.json()["groups"][0]["summary"]["episode_count"] == 12
        assert result.json()["counts"]["instrument_episodes_in_window"] == 13
        assert client.get("/v1/subjects/sleep-demo-14d/sleep-analysis",
                          params=params | {"end": START.isoformat()}).status_code == 422
        assert client.get("/v1/subjects/sleep-demo-14d/sleep-analysis",
                          params=params | {"start": "2026-11-01T00:00:00"}).status_code == 422
