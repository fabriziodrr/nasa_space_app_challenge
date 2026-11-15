"""Dedicated LangGraph data workflow: bounded retrieval and deterministic report."""
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from .integrated_context import IntegratedContext


class DataState(TypedDict, total=False):
    context: dict[str, Any]
    report: dict[str, Any]


def build_data_agent(context_provider: IntegratedContext):
    """Compile a read-only workflow bound to an application-selected subject/session."""
    def collect(_state: DataState) -> dict:
        return {"context": context_provider.get()}

    def analyze(state: DataState) -> dict:
        context = state["context"]
        sleep_data = context["sleep"]
        sleep_context = sleep_data["sleep_context"]
        measurement = sleep_context["latest_measurement"]
        feedback = sleep_context["latest_confirmed_feedback"]
        vision = context["vision"]
        eye = vision.get("observation")
        # Preserve quality and uncertainty; no medical conclusion or derived score.
        report = {
            "schema_version": "data-agent-demo-1",
            "subject_id": sleep_data["subject_id"],
            "identity_link": context["identity_link"],
            "snapshot_id": sleep_data["snapshot_id"],
            "sleep": {
                "status": "available" if measurement else "missing",
                "observation": measurement,
                "personal_reference": sleep_context["personal_reference"],
                "synthetic": sleep_data["synthetic"],
            },
            "reported_state": {
                "status": "available" if feedback else "missing",
                "observation": feedback,
                "sleep_alignment": sleep_context["feedback_alignment"],
            },
            "vision": {
                "status": vision["status"],
                "observation": eye,
                "usable_as_evidence": bool(eye and eye.get("source") == "webcam" and eye.get("usability") == "USABLE"),
            },
            "cross_source_conclusion": None,
            "limits": context["limits"] + sleep_context["limits"] + vision.get("limits", []),
        }
        return {"report": report}

    graph = StateGraph(DataState)
    graph.add_node("collect", collect)
    graph.add_node("analyze", analyze)
    graph.add_edge(START, "collect")
    graph.add_edge("collect", "analyze")
    graph.add_edge("analyze", END)
    return graph.compile()


def run_data_agent(context_provider: IntegratedContext) -> dict:
    return build_data_agent(context_provider).invoke({})["report"]
