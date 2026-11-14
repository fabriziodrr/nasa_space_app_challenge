import pytest
from pydantic import ValidationError

pytest.importorskip("langchain_core")

from aegis_data.langchain_tools import create_data_tools
from aegis_data.service import DataService
from aegis_data.store import Store


def test_tools_are_bound_to_subject_and_data_mode(tmp_path):
    store = Store(tmp_path / "data.sqlite3")
    store.add({"kind": "sleep", "subject_id": "crew-1", "observed_at": "2026-11-14T07:00:00Z",
               "sleep_hours": 6, "sleep_quality": 3, "synthetic": True})
    tools = {t.name: t for t in create_data_tools(DataService(store), subject_id="crew-1", synthetic=True)}
    context = tools["get_context"].invoke({})
    assert context["latest_valid_sleep"]["sleep_hours"] == 6
    assert context["synthetic"] is True
    # LangChain may discard unexpected fields for an empty schema; identity is
    # bound in the closure and cannot be changed by tool arguments.
    assert tools["get_context"].invoke({"subject_id": "crew-2"})["latest_valid_sleep"]["subject_id"] == "crew-1"
    analysis = tools["analyze_sleep"].invoke({"start": "2026-11-01T00:00:00Z", "end": "2026-11-15T00:00:00Z"})
    assert analysis["subject_id"] == "crew-1"
    assert analysis["synthetic"] is True
    assert analysis["status"] == "insufficient_data"
    with pytest.raises(ValidationError):
        tools["analyze_sleep"].invoke({"start": "2026-11-15T00:00:00Z", "end": "2026-11-01T00:00:00Z"})
    with pytest.raises(ValidationError):
        tools["analyze_sleep"].invoke({"start": "2026-11-01T00:00:00", "end": "2026-11-15T00:00:00Z"})
