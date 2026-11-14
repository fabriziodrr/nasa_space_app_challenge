import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from aegis_data.api import create_app
from aegis_data.service import DataService
from aegis_data.store import Store


def measured(day=14, hours=5, **changes):
    return {"kind": "sleep_measurement", "observation_id": f"sleep-device-{day}",
            "subject_id": "crew-1", "source": "instrument", "device_id": "watch-1",
            "method": "actigraphy-demo", "period_start": f"2026-11-{day:02d}T00:00:00Z",
            "period_end": f"2026-11-{day:02d}T08:00:00Z",
            "observed_at": f"2026-11-{day:02d}T08:00:00Z", "sleep_hours": hours} | changes


def reported(**changes):
    return {"kind": "speech_feedback", "observation_id": "feedback-1", "subject_id": "crew-1",
            "observed_at": "2026-11-14T09:00:00Z", "turn_id": "turn-1",
            "basis": "self_report", "user_confirmed": True, "fatigue_rating": 8} | changes


def test_instrument_and_speech_cross_reference_with_provenance(tmp_path):
    store = Store(tmp_path / "data.sqlite3")
    store.add_many([measured(10, 7), measured(11, 8), measured(12, 7.5), measured(), reported()])
    snap = DataService(store).snapshot("crew-1")
    ctx = snap["sleep_context"]
    assert len(snap["vigilance"]) == 0
    assert ctx["personal_reference"]["median_sleep_hours"] == 7.5
    assert ctx["personal_reference"]["change_hours"] == -2.5
    assert ctx["latest_confirmed_feedback"]["fatigue_rating"] == 8
    assert ctx["feedback_alignment"] == "within_demo_window"
    assert ctx["fatigue_diagnosis"] is None
    assert len(ctx["personal_reference"]["observation_ids"]) == 3


@pytest.mark.parametrize("changes", [
    {"basis": "model_inference", "user_confirmed": False},
    {"user_confirmed": False}, {"quality": "invalid"},
])
def test_unconfirmed_or_inferred_feedback_cannot_be_confirmed_context(tmp_path, changes):
    store = Store(tmp_path / "data.sqlite3")
    store.add_many([measured(), reported(**changes)])
    snapshot = DataService(store).snapshot("crew-1")
    assert len(snapshot["speech_feedback"]) == 1
    assert snapshot["sleep_context"]["latest_confirmed_feedback"] is None


def test_old_feedback_is_not_associated_with_new_sleep(tmp_path):
    store = Store(tmp_path / "data.sqlite3")
    store.add_many([measured(), reported(observed_at="2026-11-10T09:00:00Z")])
    ctx = DataService(store).snapshot("crew-1")["sleep_context"]
    assert ctx["feedback_alignment"] == "different_periods"


@pytest.mark.parametrize("change", [
    {"sleep_hours": 9}, {"period_end": "2026-11-13T00:00:00Z"},
    {"observed_at": "2026-11-14T07:00:00Z"},
])
def test_impossible_measurement_is_rejected(tmp_path, change):
    with pytest.raises(ValidationError):
        Store(tmp_path / "data.sqlite3").add(measured(**change))


def test_feedback_endpoint_updates_context_and_keeps_synthetic_separate(tmp_path):
    with TestClient(create_app(tmp_path / "data.sqlite3")) as client:
        assert client.post("/v1/observations", json=measured(synthetic=True)).status_code == 201
        response = client.post("/v1/speech-feedback", json=reported(synthetic=True))
        assert response.status_code == 201
        body = response.json()
        ctx = body["context"]["sleep_context"]
        assert ctx["feedback_alignment"] == "within_demo_window"
        snapshot = client.get("/v1/subjects/crew-1/snapshot?synthetic=true").json()
        assert snapshot["snapshot_id"] == body["context"]["snapshot_id"]
        assert client.get("/v1/subjects/crew-1/agent-context").json()["sleep_context"]["latest_measurement"] is None
        assert client.post("/v1/speech-feedback", json=reported(synthetic=True)).status_code == 409
        assert client.post("/v1/speech-feedback", json=reported(basis="model_inference")).status_code == 422
