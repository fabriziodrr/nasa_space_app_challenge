"""LangChain wrappers for the existing read-only data service.

The application binds the subject; the model never supplies an identity or database path.
"""
from datetime import datetime

from langchain_core.tools import StructuredTool
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator

from .agent_tools import AgentDataTools
from .service import DataService


class ContextInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SleepAnalysisInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    start: AwareDatetime = Field(description="Inizio incluso, ISO 8601 con fuso orario")
    end: AwareDatetime = Field(description="Fine esclusa, ISO 8601 con fuso orario; massimo 366 giorni dopo start")

    @model_validator(mode="after")
    def valid_window(self):
        from .sleep_analysis import validate_window
        validate_window(self.start, self.end)
        return self


def create_data_tools(service: DataService, *, subject_id: str, synthetic: bool = False) -> list[StructuredTool]:
    """Build per-session tools. Call only with identity selected by trusted application code."""
    bound = AgentDataTools(service, subject_id, synthetic=synthetic)

    def get_context() -> dict:
        return bound.get_context()

    def analyze_sleep(start: datetime, end: datetime) -> dict:
        return bound.analyze_sleep(start, end)

    return [
        StructuredTool.from_function(
            func=get_context, name="get_context", args_schema=ContextInput,
            description="Leggi il contesto disponibile dell'astronauta corrente, con provenienza, orari e limiti.",
        ),
        StructuredTool.from_function(
            func=analyze_sleep, name="analyze_sleep", args_schema=SleepAnalysisInput,
            description="Analizza il sonno dell'astronauta corrente per un intervallo esplicito; risultati descrittivi, non diagnosi.",
        ),
    ]
