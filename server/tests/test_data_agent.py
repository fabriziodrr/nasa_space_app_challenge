import pytest
pytest.importorskip("langgraph")

from fastapi.testclient import TestClient
from aegis_data.agent_tools import AgentDataTools
from aegis_data.api import create_app
from aegis_data.data_agent import run_data_agent
from aegis_data.integrated_context import IntegratedContext
from aegis_data.langchain_tools import create_data_tools
from aegis_data.service import DataService
from aegis_data.store import Store
from aegis_data.vision_bridge import VisionUnavailable


def add_sleep(store):
    store.add({"kind": "sleep_measurement", "subject_id": "sleep-demo-14d", "observation_id": "night-1",
        "synthetic": True, "observed_at": "2026-11-14T08:00:00Z", "device_id": "demo-watch",
        "method": "simulated-actigraphy", "period_start": "2026-11-14T00:00:00Z",
        "period_end": "2026-11-14T08:00:00Z", "sleep_hours": 5.5})


class Reader:
    def __init__(self, result): self.result = result
    def read(self):
        if isinstance(self.result, Exception): raise self.result
        return self.result


@pytest.mark.parametrize("vision, status, usable", [
    ({"status": "selected", "observation": {"source": "webcam", "usability": "USABLE"}}, "selected", True),
    ({"status": "selected", "observation": {"source": "synthetic", "usability": "INSUFFICIENT"}}, "selected", False),
    ({"status": "not_selected", "observation": None}, "not_selected", False),
    (VisionUnavailable("offline"), "unavailable", False),
])
def test_data_agent_preserves_quality_and_missing_feedback(tmp_path, vision, status, usable):
    store = Store(tmp_path / "db.sqlite3")
    add_sleep(store)
    service = DataService(store)
    context = IntegratedContext(AgentDataTools(service, "sleep-demo-14d", synthetic=True), Reader(vision))
    result = run_data_agent(context)
    assert result["sleep"]["observation"]["sleep_hours"] == 5.5
    assert result["sleep"]["synthetic"] is True
    assert result["reported_state"]["status"] == "missing"
    assert result["vision"]["status"] == status
    assert result["vision"]["usable_as_evidence"] is usable
    assert result["identity_link"] == "demo_only_unverified"
    assert result["cross_source_conclusion"] is None
    tools = create_data_tools(service, subject_id="sleep-demo-14d", synthetic=True, vision_reader=Reader(vision))
    assert {t.name: t for t in tools}["analyze_sensor_data"].invoke({}) == result


def test_data_analysis_api_requires_demo_token(tmp_path, monkeypatch):
    monkeypatch.setenv("AGENT_DEMO_TOKEN", "example-token-12345")
    monkeypatch.setattr("aegis_data.vision_bridge.SelectedVisionReader.read", lambda self: {"status": "not_selected", "observation": None})
    store = Store(tmp_path / "api.sqlite3")
    add_sleep(store)
    with TestClient(create_app(store.path)) as client:
        payload = {"vision_session_id": "session-1"}
        assert client.post("/v1/demo/data-analysis", json=payload).status_code == 401
        response = client.post("/v1/demo/data-analysis", json=payload,
                               headers={"Authorization": "Bearer example-token-12345"})
        assert response.status_code == 200
        assert response.json()["vision"]["status"] == "not_selected"
        assert response.json()["sleep"]["observation"]["sleep_hours"] == 5.5


def test_sensor_demo_flows_to_agent_and_rejects_inconsistent_rem(tmp_path):
    import json
    from pathlib import Path
    store = Store(tmp_path / "sensor.sqlite3")
    rows = json.loads((Path(__file__).parents[1] / "examples/nasa_sensor_demo.json").read_text())
    store.add_many(rows)
    service = DataService(store)
    report = run_data_agent(IntegratedContext(AgentDataTools(service, "sleep-demo-14d", synthetic=True),
                                             Reader({"status": "not_selected", "observation": None})))
    measurement = report["sleep"]["observation"]
    assert measurement["sleep_stages"]["rem_minutes"] == 78
    assert measurement["heart_rate_variability"]["value_ms"] == 42
    assert measurement["awakenings_count"] == 3
    assert report["sleep"]["synthetic"] is True
    with pytest.raises(ValueError):
        store.add(rows[0] | {"observation_id": "invalid-rem", "sleep_stages": {"device_id": "test", "method": "simulated_eeg", "rem_minutes": 500}})
    with pytest.raises(ValueError):
        store.add(rows[0] | {"observation_id": "fake-real", "synthetic": False})
