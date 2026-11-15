import json
from urllib.error import URLError

import pytest
from fastapi.testclient import TestClient
from aegis_data import companion, vision_bridge
from aegis_data.api import create_app
from aegis_data.langchain_tools import create_data_tools
from aegis_data.service import DataService
from aegis_data.store import Store
from aegis_data.vision_bridge import SelectedVisionReader


class FakeResponse:
    def __init__(self, value):
        self.value = value
    def __enter__(self):
        return self
    def __exit__(self, *args):
        pass
    def read(self, limit):
        return json.dumps({"data": self.value}).encode()


def observation():
    return {"id": "v-1", "sessionId": "session-1", "source": "webcam", "usability": "INSUFFICIENT",
            "reasons": ["LOW_COVERAGE"], "startedAt": None, "endedAt": None, "importedAt": "2026-11-14T10:00:00Z",
            "elapsedMs": 1000, "validMs": 500, "coverage": 0.5, "closureFraction": 0.2,
            "completeCount": 1, "incompleteCount": 0, "prolongedCount": 0, "longestCompleteMs": 100,
            "interruption": None, "sha256": "private-metadata"}


def test_reader_and_tool_limit_data_and_hold_session(tmp_path, monkeypatch):
    def fake_open(request, timeout):
        assert request.full_url.endswith("/sessions/session-1/vision-selection")
        assert request.headers["Authorization"] == "Bearer example-token-12345"
        return FakeResponse(observation())
    monkeypatch.setattr(vision_bridge, "urlopen", fake_open)
    reader = SelectedVisionReader("session-1", "example-token-12345")
    tools = create_data_tools(DataService(Store(tmp_path / "x.sqlite3")), subject_id="demo", synthetic=True, vision_reader=reader)
    value = {t.name: t for t in tools}["get_selected_vision"].invoke({"session_id": "other"})
    assert value["observation"]["usability"] == "INSUFFICIENT"
    assert value["observation"]["source"] == "webcam"
    assert "sha256" not in value["observation"]


def test_unselected_and_unavailable_are_distinct(tmp_path, monkeypatch):
    reader = SelectedVisionReader("session-1", "example-token-12345")
    monkeypatch.setattr(vision_bridge, "urlopen", lambda *a, **kw: FakeResponse(None))
    assert reader.read()["status"] == "not_selected"
    def fail(*args, **kwargs):
        raise URLError("offline")
    monkeypatch.setattr(vision_bridge, "urlopen", fail)
    tools = create_data_tools(DataService(Store(tmp_path / "x.sqlite3")), subject_id="demo", vision_reader=reader)
    assert {t.name: t for t in tools}["get_selected_vision"].invoke({})["status"] == "unavailable"


def test_reader_accepts_configured_loopback_but_rejects_remote_addresses(monkeypatch):
    reader = SelectedVisionReader("session-1", "example-token-12345")
    seen = []
    def fake_open(request, timeout):
        seen.append(request.full_url)
        return FakeResponse(None)
    monkeypatch.setattr(vision_bridge, "urlopen", fake_open)
    monkeypatch.setenv("AGENT_NODE_API_URL", "http://127.0.0.1:13000")
    assert reader.read()["status"] == "not_selected"
    assert seen[0].startswith("http://127.0.0.1:13000/")
    monkeypatch.setenv("AGENT_NODE_API_URL", "http://example.com:13000")
    with pytest.raises(vision_bridge.VisionUnavailable):
        reader.read()
    assert len(seen) == 1


def test_endpoint_requires_token_to_request_vision(tmp_path, monkeypatch):
    monkeypatch.setenv("AGENT_DEMO_TOKEN", "example-token-12345")
    seen = {}
    def build(service, subject_id, synthetic, **kwargs):
        seen.update(kwargs)
        return object()
    monkeypatch.setattr(companion, "build_companion", build)
    monkeypatch.setattr(companion, "converse", lambda *args: "ok")
    with TestClient(create_app(tmp_path / "api.sqlite3")) as client:
        payload = {"message": "occhi?", "vision_session_id": "session-1"}
        assert client.post("/v1/demo/companion", json=payload).status_code == 401
        assert client.post("/v1/demo/companion", json=payload, headers={"Authorization": "Bearer example-token-12345"}).status_code == 200
        assert seen["vision_reader"].session_id == "session-1"
