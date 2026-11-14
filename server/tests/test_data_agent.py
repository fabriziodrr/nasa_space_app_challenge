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
