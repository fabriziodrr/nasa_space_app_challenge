# I5 — Direct sending of eyelid measurement

The agent demo incorporates the eyelid prototype in an iframe. Once measurement is stopped, the prototype automatically sends the summary to the host page, which records it and selects it for the current session. Sharing with Terra is a separate choice, at check-in confirmation.

## Local startup

1. From the agent root run `npm run dev` and open `http://localhost:3000/voice-demo`.
2. From the `feature-visione-palpebrale/vision-prototype` folder run `npm run dev`. The prototype uses `http://127.0.0.1:5173`.
3. Start a session in the demo, open **Visione palpebrale**, allow the camera, calibrate, start and stop the measurement. Verify the confirmation message; in case of error, sending can be repeated.

Direct sending concerns the webcam measurement. Camera access requires a secure context and user permission. Closing the panel or confirming check-in removes the iframe, releasing the prototype resources. The eyelid page continues to interrupt capture when hidden or when the device changes.

## Origins and host integration

The defaults are `NEXT_PUBLIC_VISION_ORIGIN=http://127.0.0.1:5173` in the agent and `VITE_AGENT_ORIGIN=http://localhost:3000` in the prototype. They must match the origins actually used in the browser: `localhost` and `127.0.0.1` are distinct origins. Specify only scheme, host, and port, without path, credentials, or parameters. HTTP is accepted only for loopback; for remote origins use HTTPS. Restart the servers after changing variables; for production, rebuild the applications. They are public variables and must not contain secrets.

The host validates exactly the iframe origin and window and does not send either the token or the session ID to the prototype. The prototype accepts only the response from the configured parent and verifies origin, window, and request identifier; the configuration is compared with the iframe referrer. A different host does not automatically receive the data. The `crewready-vision-agent-v1` protocol transports the measurement JSON, without images or video; the host associates it with its own authenticated session and uses the I1 endpoint. CORS between Vite and Next does not need to be enabled because it is the agent page that calls its own API.

Sending starts automatically at the end of the measurement and maintains a stable identifier and the same snapshot in retries. If it does not receive a confirmation within 15 seconds, the prototype allows retrying or canceling the pending send. Cancellation removes the local attempt, but cannot cancel a request already arrived at the server: the measurement might still appear in the host. The server deduplicates with the request identifier. The host must allow camera use in the iframe and configure any CSP policies for its own origins.

## Checks and code status

The bridge tests cover origin and window verification, rejection of foreign messages, size limit, timeout, and reuse of the same ID and content. The practical webcam, microphone, device change, suspension, and network recovery test remains in I6; it is not a validation of measurement accuracy.

The prototype is included directly in the main repo in `feature-visione-palpebrale/`, together with the model and WASM assets: a normal clone/pull is sufficient, without access to a second repository. The sources come from revision `9803a5f41eff521db5d1305af82323da11332eb5`, including I5 changes and pre-existing local changes. The parser copied into the backend matches the corresponding 20 TypeScript sources. Dependency installation and startup are described in the [main README](../../README.md#visione-palpebrale-inclusa).
