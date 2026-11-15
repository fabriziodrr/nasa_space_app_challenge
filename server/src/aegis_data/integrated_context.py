"""Bound, read-only composition of sleep data and the selected vision measurement."""
from .agent_tools import AgentDataTools
from .vision_bridge import VisionUnavailable


class IntegratedContext:
    def __init__(self, data_tools: AgentDataTools, vision_reader):
        self._data_tools = data_tools
        self._vision_reader = vision_reader

    def get(self) -> dict:
        sleep = self._data_tools.get_context()
        try:
            vision = self._vision_reader.read() if self._vision_reader else {"status": "not_selected", "observation": None}
        except VisionUnavailable:
            vision = {"status": "unavailable", "observation": None}
        return {
            "schema_version": "integrated-context-demo-1",
            "sleep": sleep,
            "vision": vision,
            "identity_link": "demo_only_unverified",
            "limits": [
                "Sleep is synthetic demo data; vision keeps its own source label",
                "The two systems do not yet share a verified subject identity",
                "Eye closure and sleep data do not establish fatigue or a diagnosis",
                "Check observation timestamps and quality before comparing",
            ],
        }
