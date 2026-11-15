"""Integration contract; only run with a disposable PostgreSQL database."""
import os
import uuid

import pytest

from aegis_data.store import DuplicateObservation, create_store


@pytest.mark.skipif(not os.environ.get("SLOTH_TEST_POSTGRES_URL"), reason="No disposable PostgreSQL configured")
def test_postgres_store_round_trip_and_atomic_duplicate():
    url = os.environ["SLOTH_TEST_POSTGRES_URL"]
    store = create_store(url)
    marker = uuid.uuid4().hex
    subject = f"test-{marker}"
    payload = {
        "observation_id": marker, "subject_id": subject, "kind": "sleep",
        "observed_at": "2026-11-14T07:00:00Z", "sleep_hours": 6,
        "sleep_quality": 3, "scale_max": 10, "synthetic": True,
    }
    try:
        store.add(payload)
        assert store.list(subject)[0] == []
        assert store.list(subject, synthetic=True)[0][0]["observation_id"] == marker
        with pytest.raises(DuplicateObservation):
            store.add_many([payload | {"observation_id": marker + "new"}, payload])
        assert len(store.list(subject, synthetic=True)[0]) == 1
    finally:
        with store.connection() as conn:
            conn.execute("DELETE FROM sloth_data.observations WHERE subject_id=%s", (subject,))


def test_store_factory_rejects_unknown_database_url():
    with pytest.raises(ValueError, match="unsupported"):
        create_store("mysql://localhost/data")
