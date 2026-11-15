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


def create_data_tools(service: DataService, *, subject_id: str, synthetic: bool = False, vision_reader=None) -> list[StructuredTool]:
    """Build per-session tools. Call only with identity selected by trusted application code."""
    bound = AgentDataTools(service, subject_id, synthetic=synthetic)

    def get_context() -> dict:
        return bound.get_context()

    def analyze_sleep(start: datetime, end: datetime) -> dict:
        return bound.analyze_sleep(start, end)

    tools = [
        StructuredTool.from_function(
            func=get_context, name="get_context", args_schema=ContextInput,
            description="Leggi il contesto disponibile dell'astronauta corrente, con provenienza, orari e limiti.",
        ),
        StructuredTool.from_function(
            func=analyze_sleep, name="analyze_sleep", args_schema=SleepAnalysisInput,
            description="Analizza il sonno dell'astronauta corrente per un intervallo esplicito; risultati descrittivi, non diagnosi.",
        ),
    ]
    if vision_reader is not None:
        from .integrated_context import IntegratedContext
        combined = IntegratedContext(bound, vision_reader)

        def get_integrated_context() -> dict:
            return combined.get()

        tools.append(StructuredTool.from_function(
            func=get_integrated_context, name="get_integrated_context", args_schema=ContextInput,
            description="Ottieni sonno e misura oculare selezionata con provenienza, qualità e limiti; contesto demo senza identità unificata.",
        ))

        def analyze_sensor_data() -> dict:
            from .data_agent import run_data_agent
            return run_data_agent(combined)

        tools.append(StructuredTool.from_function(
            func=analyze_sensor_data, name="analyze_sensor_data", args_schema=ContextInput,
            description="Esegui l'agente dati e ottieni un rapporto strutturato su sonno, feedback e misura vision selezionata.",
        ))

        def get_selected_vision() -> dict:
            from .vision_bridge import VisionUnavailable
            try:
                return vision_reader.read()
            except VisionUnavailable:
                return {"status": "unavailable", "observation": None}
        tools.append(StructuredTool.from_function(
            func=get_selected_vision, name="get_selected_vision", args_schema=ContextInput,
            description="Leggi la misura oculare selezionata nella sessione corrente con qualità e limiti; non è una diagnosi.",
        ))
    return tools
