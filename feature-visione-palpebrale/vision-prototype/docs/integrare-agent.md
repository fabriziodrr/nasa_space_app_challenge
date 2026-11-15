# Sending to the agent from a guest app

If the prototype is loaded in an iframe from an authorized origin, a stopped webcam measurement can be sent using the **Send measurement to agent** button. The user remains responsible for starting the webcam, calibration, stopping, and sending. The page can still export the file manually. Synthetic replays are not sent by the webcam button.

Configure `VITE_AGENT_ORIGIN` with the exact host origin, for example `http://localhost:3000`; the default is this value. HTTPS is required for remote origins. Do not insert paths, queries, credentials, or secrets. The host must load the prototype in an iframe with `allow="camera"`, set a referrer that includes the origin, and access from a secure context. If the referrer does not match the configured origin, the send button is not shown. The configuration is public and requires a new build after a change.

The `crewready-vision-agent-v1` protocol uses `postMessage` exclusively toward the configured origin. The `IMPORT` message contains `requestId` and the serialized JSON of `crewready-session-v2`; it does not contain tokens, session IDs, video, or images. The host must check both `event.origin` and `event.source` against the iframe window, apply message limits, associate its own identity and session, and send the result to its own API. It must not trust data sent from other windows. The host responds with `IMPORT_RESULT`, the same `requestId`, and `ok: boolean`, toward the exact origin of the iframe.

The button freezes the snapshot and identifier on the first request. If no response is received within 15 seconds, the user can retry: the same bytes and same ID are sent, to be used as an idempotency key in the backend. A positive response only indicates that the host received the result; selection for the conversation and sharing with Terra are up to the host. The user can cancel a pending send and prepare a new snapshot.

The host must limit export size and type and keep server validation and authorization independent from browser controls. Tests simulate messages, timeouts, and retries; testing with physical webcam and microphone remains to be performed.
