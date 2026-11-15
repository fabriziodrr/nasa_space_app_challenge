"""Read a selected vision observation via the authenticated local TypeScript API."""
import json
import re
from urllib.error import URLError
from urllib.request import Request, urlopen


class VisionUnavailable(RuntimeError):
    pass


class SelectedVisionReader:
    def __init__(self, session_id: str, token: str):
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", session_id) or not 16 <= len(token) <= 512 or any(c in token for c in "\r\n"):
            raise ValueError("Invalid session or credential")
        self.session_id = session_id
        self._token = token

    def read(self) -> dict:
        url = f"http://127.0.0.1:3000/api/agent/v1/sessions/{self.session_id}/vision-selection"
        request = Request(url, headers={"Authorization": f"Bearer {self._token}", "Accept": "application/json"})
        try:
            with urlopen(request, timeout=5) as response:
                body = response.read(65537)
            if len(body) > 65536:
                raise ValueError("Oversized response")
            envelope = json.loads(body)
            observation = envelope["data"]
            if observation is None:
                return {"status": "not_selected", "observation": None}
            if not isinstance(observation, dict) or observation.get("sessionId") != self.session_id:
                raise ValueError("Invalid selected observation")
            if observation.get("source") not in ("webcam", "synthetic") or observation.get("usability") not in ("USABLE", "INSUFFICIENT"):
                raise ValueError("Invalid source or quality")
            keys = ("id", "source", "usability", "reasons", "startedAt", "endedAt", "importedAt",
                    "elapsedMs", "validMs", "coverage", "closureFraction", "completeCount",
                    "incompleteCount", "prolongedCount", "longestCompleteMs", "interruption")
            if any(key not in observation for key in keys):
                raise ValueError("Incomplete observation")
            return {"status": "selected", "observation": {key: observation[key] for key in keys},
                    "limits": ["Eye closure does not diagnose fatigue or measure sleep",
                               "Quality is evaluated by the vision service; synthetic data are not clinical evidence"]}
        except (URLError, OSError, ValueError, KeyError, TypeError, json.JSONDecodeError) as exc:
            raise VisionUnavailable("Selected vision observation unavailable") from exc
