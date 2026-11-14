import pytest
pytest.importorskip("langchain")

from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage
from aegis_data import companion
from aegis_data.api import create_app
from aegis_data.service import DataService
from aegis_data.store import Store


def test_factory_binds_tools_to_demo_subject(tmp_path, monkeypatch):
    store = Store(tmp_path / "test.sqlite3")
    store.add({"kind": "sleep", "subject_id": "sleep-demo-14d", "observed_at": "2026-11-14T07:00:00Z",
               "sleep_hours": 6, "sleep_quality": 3, "synthetic": True})
    captured = {}
    def fake_create_agent(**kwargs):
        captured.update(kwargs)
        return object()
    monkeypatch.setattr(companion, "create_agent", fake_create_agent)
    model = object()
    companion.build_companion(DataService(store), "sleep-demo-14d", True, model=model)
    assert captured["model"] is model
    assert captured["tools"][0].invoke({})["latest_valid_sleep"]["sleep_hours"] == 6
    assert {t.name for t in captured["tools"]} == {"get_context", "analyze_sleep"}


def test_conversation_preserves_turns_and_requires_text():
    class FakeAgent:
        def invoke(self, state, config):
            assert isinstance(state["messages"][0], HumanMessage)
            assert isinstance(state["messages"][1], AIMessage)
            assert state["messages"][-1].content == "Come sto?"
            assert config["recursion_limit"] == 12
            return {"messages": [AIMessage(content="Vediamo i tuoi dati.")]}
    assert companion.converse(FakeAgent(), "Come sto?", [
        {"role": "user", "content": "Ciao"}, {"role": "assistant", "content": "Ciao"},
    ]) == "Vediamo i tuoi dati."


def test_demo_endpoint_success_and_failure(tmp_path, monkeypatch):
    seen = {}
    def fake_build(service, subject_id, synthetic):
        seen.update(subject=subject_id, synthetic=synthetic)
        return object()
    monkeypatch.setattr(companion, "build_companion", fake_build)
    monkeypatch.setattr(companion, "converse", lambda agent, message, history: "Ciao astronauta")
    with TestClient(create_app(tmp_path / "api.sqlite3")) as client:
        result = client.post("/v1/demo/companion", json={"message": "Ciao"})
        assert result.status_code == 200
        assert result.json()["response"] == "Ciao astronauta"
        assert seen == {"subject": "sleep-demo-14d", "synthetic": True}
        assert client.post("/v1/demo/companion", json={"message": "Ciao", "subject_id": "other"}).status_code == 422
        monkeypatch.setattr(companion, "build_companion", lambda **kwargs: (_ for _ in ()).throw(RuntimeError("offline")))
        assert client.post("/v1/demo/companion", json={"message": "Ciao"}).status_code == 503
        assert client.get("/health").status_code == 200
