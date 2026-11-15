# I2 — Vision in conversation context

The conversation service uses `VisionObservationReader.getSelectedForSession(astronautId, sessionId)` to obtain at most the explicitly selected measure. It validates the I0 contract and checks astronaut and session before providing the AI with a limited summary, without digest or superfluous metadata. An invalid result or one belonging to another session interrupts the turn; no reader or no selection produces an empty context. The AI cannot use vision as a source to create a self-referential observation.

The runtime wires `VisionService`, which returns only the observation selected in the authorized session; in the absence of a selection the result is empty. Tests can inject `MockVisionReader`, which produces declaredly synthetic and insufficient data, or specific readers. Import and selection are documented in the [I1 guide](i1-vision-import.md). The demo does not constitute a real webcam proof.

The values `AGENT_VISION_MIN_VALID_MS` (30000), `AGENT_VISION_MIN_COVERAGE` (0.7) and `AGENT_VISION_MAX_AGE_MINUTES` (120) regulate the check in the conversation context. The limitations are recalculated at each turn and added to those of the reader, without promoting insufficient measures; freezing at confirmation belongs to I1. The values are experimental, not clinical thresholds.

Nemotron and OpenAI receive the context with the same Italian instructions; the simulated provider labels synthetic data and asks for clarification on prolonged closures only for usable measures. Text and voice use the same service. Sending the summary to the remote model occurs only in the configured AI path, and is distinct from operational sharing with Terra.
