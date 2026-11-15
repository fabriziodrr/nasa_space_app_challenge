import pytest

pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

from aegis_data.api import create_app


def test_api_round_trip_and_error_contract(tmp_path):
    with TestClient(create_app(tmp_path / "api.sqlite3")) as client:
        payload = {"observation_id": "sleep-1", "kind": "sleep", "subject_id": "crew-1",
                   "observed_at": "2026-11-14T07:00:00Z", "sleep_hours": 6, "sleep_quality": 3, "scale_max": 10}
        assert client.post("/v1/observations", json=payload).status_code == 201
        assert client.post("/v1/observations", json=payload).status_code == 409
        assert client.post("/v1/observations", json=payload | {"sleep_hours": -1}).status_code == 422
        snap = client.get("/v1/subjects/crew-1/snapshot").json()
        context = client.get("/v1/subjects/crew-1/agent-context").json()
        assert snap["snapshot_id"] == context["snapshot_id"]
        assert snap["sleep"][0]["sleep_hours"] == 6
        assert client.get("/v1/subjects/crew-1/snapshot?start=2026-11-15T00:00:00Z&end=2026-11-14T00:00:00Z").status_code == 422


def test_demo_analysis_uses_profile_subject_without_a_vision_session(tmp_path, monkeypatch):
    from aegis_data import data_agent
    monkeypatch.setenv("AGENT_CREW_02_TOKEN", "crew-two-token-12345")
    monkeypatch.setattr(data_agent, "run_data_agent", lambda provider: provider.get())
    with TestClient(create_app(tmp_path / "api.sqlite3")) as client:
        assert client.post("/v1/demo/data-analysis", json={}).status_code == 401
        response = client.post("/v1/demo/data-analysis", json={}, headers={"Authorization": "Bearer crew-two-token-12345"})
        assert response.status_code == 200
        assert response.json()["sleep"]["subject_id"] == "crew-demo-02"
        assert response.json()["vision"]["status"] == "not_selected"


def test_generated_crew_credentials_match_node_demo_profiles(tmp_path, monkeypatch):
    import hashlib
    import hmac
    from aegis_data import data_agent
    monkeypatch.setenv("AGENT_DEMO_TOKEN", "local-demo-token-123456")
    monkeypatch.delenv("AGENT_CREW_02_TOKEN", raising=False)
    monkeypatch.setattr(data_agent, "run_data_agent", lambda provider: provider.get())
    token = hmac.new(b"local-demo-token-123456", b"aegis-demo-crew:crew-demo-02", hashlib.sha256).hexdigest()
    with TestClient(create_app(tmp_path / "crew.sqlite3")) as client:
        response = client.post("/v1/demo/data-analysis", json={}, headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200
        assert response.json()["sleep"]["subject_id"] == "crew-demo-02"
