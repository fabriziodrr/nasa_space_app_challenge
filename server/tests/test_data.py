import pytest
from pydantic import ValidationError

from aegis_data.agent_tools import AgentDataTools
from aegis_data.service import DataService
from aegis_data.store import DuplicateObservation, Store


@pytest.fixture
def store(tmp_path):
    return Store(tmp_path / "test.sqlite3")


def sleep(**changes):
    return dict(observation_id="sleep-1", subject_id="crew-1", kind="sleep",
                observed_at="2026-11-14T07:00:00+01:00", sleep_hours=5.5,
                sleep_quality=2, **changes)


def pvt(index, rt=250, **changes):
    return dict(observation_id=f"pvt-{index}", subject_id="crew-1", kind="vigilance",
                observed_at=f"2026-11-{index:02d}T07:00:00Z", device_id="pc-1",
                trials=[{"status": "response", "rt_ms": rt}] * 5) | changes


def test_persistence_utc_and_subject_isolation(store):
    store.add(sleep())
    reopened = Store(store.path)
    rows, truncated = reopened.list("crew-1")
    assert rows[0]["observed_at"] == "2026-11-14T06:00:00+00:00"
    assert rows[0]["sleep_hours"] == 5.5
    assert not truncated
    assert reopened.list("other-crew")[0] == []


@pytest.mark.parametrize("change", [
    {"sleep_hours": -1}, {"sleep_hours": float("nan")},
    {"sleep_quality": 6}, {"sleep_quality": 2.5},
    {"observed_at": "2026-11-14T07:00:00"}, {"invented_metric": 4},
])
def test_invalid_data_never_persisted(store, change):
    with pytest.raises(ValidationError):
        store.add(sleep() | change)
    assert store.list("crew-1")[0] == []


def test_unconfirmed_model_mood_is_rejected(store):
    mood = {"kind": "mood", "subject_id": "crew-1", "observed_at": "2026-11-14T07:00:00Z",
            "confirmed": False, "mood_rating": 3, "alertness": 7}
    with pytest.raises(ValidationError):
        store.add(mood)


def test_synthetic_records_never_enter_real_snapshot(store):
    store.add(sleep(synthetic=True))
    assert DataService(store).snapshot("crew-1")["sleep"] == []
    assert len(DataService(store).snapshot("crew-1", synthetic=True)["sleep"]) == 1


def test_import_rolls_back_on_duplicate(store):
    store.add(sleep())
    with pytest.raises(DuplicateObservation):
        store.add_many([pvt(1), sleep()])
    assert [r["kind"] for r in store.list("crew-1")[0]] == ["sleep"]


def test_baseline_uses_prior_comparable_sessions_only(store):
    store.add_many([pvt(1, 200), pvt(2, 250), pvt(3, 300), pvt(4, 312),
                    pvt(5, 900, quality="invalid"), pvt(2, 900, observation_id="other-device", device_id="pc-2")])
    snap = DataService(store).snapshot("crew-1")
    comparison = snap["comparison"]
    assert comparison["current_observation_id"] == "pvt-4"
    assert comparison["baseline_median_rt_ms"] == 250
    assert comparison["relative_change_pct"] == pytest.approx(24.8)
    assert comparison["baseline_observation_ids"] == ["pvt-3", "pvt-2", "pvt-1"]
    assert snap["vigilance"][0]["quality"] == "invalid"


def test_trial_metrics_and_insufficient_data(store):
    trials = [{"status": "response", "rt_ms": n} for n in (80, 200, 300, 400, 500, 600)]
    trials += [{"status": "missed"}, {"status": "false_start"}]
    store.add(pvt(1, trials=trials))
    snap = DataService(store).snapshot("crew-1")
    m = snap["vigilance"][0]["metrics"]
    assert (m["median_rt_ms"], m["false_start_count"], m["lapse_count"], m["missed_count"]) == (400, 2, 2, 1)
    assert snap["comparison"]["status"] == "insufficient_data"
    assert snap["comparison"]["relative_change_pct"] is None


def test_agent_and_dashboard_share_snapshot_and_no_raw_trials(store):
    store.add(pvt(1))
    service = DataService(store)
    snapshot = service.snapshot("crew-1")
    context = AgentDataTools(service, "crew-1").get_context()
    assert context["snapshot_id"] == snapshot["snapshot_id"]
    assert "trials" not in context["latest_vigilance"]
    assert context["snapshot_id"] == AgentDataTools(service, "crew-1").get_context()["snapshot_id"]
    store.add(sleep())
    assert context["snapshot_id"] != service.snapshot("crew-1")["snapshot_id"]
