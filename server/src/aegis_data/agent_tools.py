"""Read-only integration boundary. No LangChain dependency and no LLM here."""
from datetime import datetime
from .service import DataService


class AgentDataTools:
    def __init__(self, service: DataService, subject_id: str, *, synthetic: bool = False):
        # Bind identity in trusted application code, never from a model tool argument.
        self._service = service
        self._subject_id = subject_id
        self._synthetic = synthetic

    def analyze_sleep(self, start: datetime, end: datetime) -> dict:
        return self._service.analyze_sleep(self._subject_id, start, end, self._synthetic)

    def get_context(self) -> dict:
        snapshot = self._service.snapshot(self._subject_id, self._synthetic)
        return {
            "snapshot_id": snapshot["snapshot_id"],
            "as_of": snapshot["as_of"],
            "synthetic": snapshot["synthetic"],
            "rule_version": snapshot["rule_version"],
            "truncated": snapshot["truncated"],
            "sleep_context": snapshot["sleep_context"],
            "latest_valid_sleep": next((r for r in snapshot["sleep"] if r["quality"] == "valid"), None),
            "latest_valid_reported_mood": next((r for r in snapshot["reported_mood"] if r["quality"] == "valid"), None),
            "comparison": snapshot["comparison"],
            "latest_vigilance": snapshot["vigilance"][0] if snapshot["vigilance"] else None,
            "limits": ["Self-reports are not diagnoses", "Comparison is illustrative, not duty clearance"],
        }
