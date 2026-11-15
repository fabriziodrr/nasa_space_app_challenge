# Backend and agent integration

The merged runtime preserves Emanuel's automatic local demo sessions, Python data context, synthetic fixture fallback and cross-source report summary, together with shared-resource checks, optional task removal and reassignment proposals. Reaction testing remains an independent prototype and is not included in the report or agent context.

Crew identities and reassignment candidates are resolved from the same server credential set. Explicit crew credentials take precedence. When absent, Node and Python derive the same per-profile credential from `AGENT_DEMO_TOKEN`, avoiding manual setup for each fictional profile. These are local demo identities, not production authentication.

Start the Python service from the repository root with `powershell -ExecutionPolicy Bypass -File scripts/start-data-backend.ps1`. The launcher loads the relevant demo credentials from the root `.env` without displaying them. Start Next.js with `npm run dev` and the webcam prototype with `npm --prefix feature-visione-palpebrale/vision-prototype run dev` in separate terminals. Both services must use matching configured credentials when an explicit crew token is present.

The static fixture fallback is only used for an explicit, untruncated missing result of a mapped fictional subject. It remains degraded and cannot serve as sensor evidence for a schedule proposal. Outages, stale or unverified data remain distinct. Shared reports and the private diary retain their existing confirmation and visibility rules.

Acceptance verification covers TypeScript, agent integration tests, Python tests and the webcam bridge tests. A new browser run with live NVIDIA, microphone and webcam is still needed after restarting the services. Existing persisted schedules without resource or eligibility metadata remain unchanged; ground can configure these fields in the schedule editor.
