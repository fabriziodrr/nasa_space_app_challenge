# I4 — Eyelid measurement test with the agent

The standalone page is `/voice-demo`. Start the project from the root with `npm run dev`, open `http://localhost:3000/voice-demo` and enter the local value `AGENT_DEMO_TOKEN`. The token is distinct from the NVIDIA key and is not stored in the browser.

Direct submission from the embedded prototype is also available: see the [I5 guide](i5-direct-vision.md). Manual import remains available.

1. Start a session and send a text or voice message to create a check-in draft. The measurement can also be imported before the first message.
2. In the eyelid prototype, start a webcam measurement or a replay, then export the v2 JSON. The prototype starts from its own folder `feature-visione-palpebrale/vision-prototype` with `npm run dev`.
3. In the agent demo, choose the file and run **Import measurement**. Upload accepts non-empty JSON files up to 10 MiB. Actual validation takes place on the server.
4. Check origin, valid duration, coverage, closure rate, interval, and limitations; press **Select measurement**. Only the selected measurement is available in the conversation. It is possible to remove the selection or proceed without a measurement.
5. In the check-in review, explicitly select personal observations and, if desired, the measurement to share with Terra. The boxes are initially unchecked. Press **Confirm check-in**: report generation is started. Confirmation closes the session conversation.

The import button uses the same key to repeat uploading the same file. If the selection or confirmation response does not arrive, the demo blocks other operations and allows repeating the same request before proceeding. Ongoing operations cannot overlap; voice recognition is interrupted during import, selection, or confirmation.

For reproducible cases, use a prototype replay to obtain a `synthetic` measurement, marked as insufficient for the operational context. A webcam measurement with valid time and coverage below the configured limits shows the related reasons; a webcam measurement sufficiently long and covered can be classified `USABLE` if recent and not interrupted. Do not transform a synthetic replay into a webcam result to simulate the usable case. Thresholds and limitations are described in the [I0 guide](vision-i0.md).

Automated tests cover the HTTP client and backend import/confirmation checks. Visual testing, real webcam and microphone, and the full report remain to be verified in I6. The proposed interface and flow do not replace Fabrizio's dashboard integration.
