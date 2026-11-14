import json
from fastapi.testclient import TestClient
from pydantic import ValidationError
import pytest

from aegis_data import vision_bridge
from aegis_data.agent_tools import AgentDataTools
from aegis_data.api import create_app
from aegis_data.integrated_context import IntegratedContext
from aegis_data.langchain_tools import create_data_tools
from aegis_data.service import DataService
from aegis_data.store import Store
from aegis_data.vision_bridge import SelectedVisionReader


def sleep():
    return {"kind": "sleep_measurement", "subject_id": "sleep-demo-14d", "synthetic": True,
            "observation_id": "n1", "observed_at": "2026-11-14T08:00:00Z", "device_id": "sim-watch",
            "method": "simulated-actigraphy", "period_start": "2026-11-14T00:00:00Z",
            "period_end": "2026-11-14T08:00:00Z", "sleep_hours": 6,
            "sleep_latency_minutes": 20, "wake_after_sleep_onset_minutes": 30,
            "awakenings_count": 2, "sleep_efficiency_percent": 75}


def test_optional_sleep_fields_are_preserved_and_checked(tmp_path):
    store = Store(tmp_path / "test.sqlite3")
    store.add(sleep())
    result = AgentDataTools(DataService(store), "sleep-demo-14d", synthetic=True).get_context()
    measurement = result["sleep_context"]["latest_measurement"]
    assert measurement["awakenings_count"] == 2
    assert measurement["sleep_latency_minutes"] == 20
    assert measurement["sleep_efficiency_percent"] == 75
    with pytest.raises(ValidationError):
        store.add(sleep() | {"observation_id": "bad", "wake_after_sleep_onset_minutes": 600})
    with pytest.raises(ValidationError):
        store.add(sleep() | {"observation_id": "bad", "sleep_efficiency_percent": 101})


def test_integrated_tool_reads_selected_vision_and_separates_provenance(tmp_path):
    store = Store(tmp_path / "test.sqlite3")
    store.add(sleep())
    class Reader:
        def read(self):
            return {"status": "selected", "observation": {"source": "webcam", "usability": "USABLE"}}
    service = DataService(store)
    tools = {t.name: t for t in create_data_tools(service, subject_id="sleep-demo-14d", synthetic=True, vision_reader=Reader())}
    result = tools["get_integrated_context"].invoke({})
    assert result["sleep"]["synthetic"] is True
    assert result["vision"]["observation"]["source"] == "webcam"
    assert result["identity_link"] == "demo_only_unverified"


def test_authenticated_demo_endpoint_reads_selected_service(tmp_path, monkeypatch):
    class FakeResponse:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def read(self, limit):
            return json.dumps({"data": {"id": "v-1", "sessionId": "session-1", "source": "synthetic",
                "usability": "INSUFFICIENT", "reasons": ["SYNTHETIC_TIME_UNAVAILABLE"], "startedAt": None,
                "endedAt": None, "importedAt": "2026-11-14T08:00:00Z", "elapsedMs": 1000, "validMs": 500,
                "coverage": .5, "closureFraction": .1, "completeCount": 1, "incompleteCount": 0,
                "prolongedCount": 0, "longestCompleteMs": 100, "interruption": None}}).encode()
    def fake_open(request, timeout):
        assert request.full_url.endswith("/session-1/vision-selection")
        assert request.headers["Authorization"] == "Bearer example-token-12345"
        return FakeResponse()
    monkeypatch.setattr(vision_bridge, "urlopen", fake_open)
    monkeypatch.setenv("AGENT_DEMO_TOKEN", "example-token-12345")
    store = Store(tmp_path / "api.sqlite3")
    store.add(sleep())
    with TestClient(create_app(store.path)) as client:
        payload = {"vision_session_id": "session-1"}
        assert client.post("/v1/demo/integrated-context", json=payload).status_code == 401
        response = client.post("/v1/demo/integrated-context", json=payload,
                               headers={"Authorization": "Bearer example-token-12345"})
        assert response.status_code == 200
        data = response.json()
        assert data["sleep"]["sleep_context"]["latest_measurement"]["sleep_hours"] == 6
        assert data["vision"]["observation"]["usability"] == "INSUFFICIENT"
        assert data["vision"]["observation"]["source"] == "synthetic"
