import os
from pathlib import Path
from typing import Annotated

from fastapi import Body, FastAPI, HTTPException
from typing import Literal
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from .agent_tools import AgentDataTools
from .models import Observation, SpeechFeedback
from .service import DataService
from .store import DuplicateObservation, Store


class ConversationMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class DemoConversation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    message: str = Field(min_length=1, max_length=4000)
    history: list[ConversationMessage] = Field(default_factory=list, max_length=20)


def create_app(db_path: str | Path | None = None) -> FastAPI:
    store = Store(db_path or os.environ.get("AEGIS_DB_PATH", "data/aegis.sqlite3"))
    service = DataService(store)
    app = FastAPI(title="AEGIS local data API", version="0.1.0")

    @app.get("/health")
    def health():
        return {"status": "ok", "schema_version": "1"}

    @app.post("/v1/demo/companion")
    def demo_companion(request: DemoConversation):
        # Demo-only fixed identity. No user-controlled access to personal records.
        try:
            from .companion import build_companion, converse
            agent = build_companion(service, subject_id="sleep-demo-14d", synthetic=True)
            response = converse(agent, request.message, [h.model_dump() for h in request.history])
            return {"response": response, "subject_id": "sleep-demo-14d", "synthetic": True}
        except Exception:
            # Preserve data APIs even if dependencies, model or local inference fail.
            raise HTTPException(503, "Companion non disponibile: verificare dipendenze e modello locale.")

    @app.post("/v1/observations", status_code=201)
    def add_observation(observation: Observation):
        try:
            return store.add(observation)
        except DuplicateObservation as exc:
            raise HTTPException(409, "observation_id already exists") from exc

    @app.get("/v1/subjects/{subject_id}/snapshot")
    def snapshot(subject_id: str, synthetic: bool = False,
                 start: AwareDatetime | None = None, end: AwareDatetime | None = None):
        try:
            return service.snapshot(subject_id, synthetic, start, end)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.post("/v1/observations/import", status_code=201)
    def import_observations(observations: Annotated[list[Observation], Body(min_length=1, max_length=10000)]):
        try:
            saved = store.add_many(observations)
        except DuplicateObservation as exc:
            raise HTTPException(409, "duplicate observation_id; no records imported") from exc
        return {"imported": len(saved), "synthetic_count": sum(r["synthetic"] for r in saved)}

    @app.post("/v1/speech-feedback", status_code=201)
    def receive_feedback(feedback: SpeechFeedback):
        # Structured ingress only. Audio processing belongs to the external module.
        try:
            saved = store.add(feedback)
        except DuplicateObservation as exc:
            raise HTTPException(409, "observation_id already exists") from exc
        return {"observation": saved,
                "context": AgentDataTools(service, feedback.subject_id,
                                          synthetic=feedback.synthetic).get_context()}

    @app.get("/v1/subjects/{subject_id}/observations")
    def observations(subject_id: str, synthetic: bool = False,
                     start: AwareDatetime | None = None, end: AwareDatetime | None = None):
        try:
            items, truncated = store.list(subject_id, synthetic, start, end)
            return {"items": items, "truncated": truncated}
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    @app.get("/v1/subjects/{subject_id}/agent-context")
    def context(subject_id: str, synthetic: bool = False):
        return AgentDataTools(service, subject_id, synthetic=synthetic).get_context()

    @app.get("/v1/subjects/{subject_id}/sleep-analysis")
    def sleep_analysis(subject_id: str, start: AwareDatetime, end: AwareDatetime,
                       synthetic: bool = False):
        try:
            return service.analyze_sleep(subject_id, start, end, synthetic)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc

    return app
