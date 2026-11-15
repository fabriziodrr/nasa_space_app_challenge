# T1 — Text conversation of the flight assistant

## Status and scope

Implemented: session opening and reading, text conversation, follow-up questions, private check-in draft, mock AI adapter, NVIDIA Nemotron adapter, optional OpenAI adapter, demo authentication, and HTTP API.

Local composition uses a Prisma repository and demo sensors/program. Sessions persist in the SQLite database on restart. To initialize it run `npm run db:push`, without seeding unless you intend to reset data.

Check-in confirmation and report and diary generation are described in the [T2 guide](t2-report-diary.md). Approval APIs and voice remain to be connected. Conversation does not apply changes to the program.

## Local startup without AI keys

Install dependencies with `npm ci`. Create `.env` from `.env.example` and set:

```dotenv
AGENT_DEMO_ENABLED=true
AGENT_DEMO_TOKEN=<token-privato-di-almeno-16-caratteri>
AGENT_AI_PROVIDER=mock
AGENT_DEMO_SCENARIO=CONFLICTING_DATA
```

Replace the placeholder with a local token. Do not use `NEXT_PUBLIC_` prefixes and do not publish the token or keys. The same token can be used in local test clients; in the final dashboard shared authentication will be used, not a service credential included in the frontend bundle.

Run `npm run db:push` to initialize the database and then `npm run dev`. On PowerShell use `npm.cmd` if `npm.ps1` is blocked by policy.

The demo is disabled by default. `instrumentation.ts` validates configuration at startup and rejects `AGENT_DEMO_ENABLED=true` in production. Until real identity and persistence adapters are connected, production APIs return 503: they do not activate temporary memory or anonymous identity.

The demo runtime is shared between routes in the same process and maintained during Next.js hot updates. Restart the server when changing configuration or runtime/core implementations; restart preserves sessions in the database.

## Testing APIs from PowerShell

To talk freely without preparing HTTP calls, start the server and in a second terminal run `npm run chat:agent`. If the server uses port 3101, run `npm run chat:agent -- --base-url http://127.0.0.1:3101`. Write one message at a time; `/checkin` shows the draft and `/esci` ends it. The chat does not confirm or automatically share the check-in.

In a second terminal, use the same token configured on the server:

```powershell
$base = 'http://localhost:3000/api/agent/v1'
$headers = @{ Authorization = 'Bearer <lo-stesso-token-locale>' }

$session = Invoke-RestMethod -Method Post -Uri "$base/sessions" `
  -Headers $headers -ContentType 'application/json' `
  -Body (@{ astronautId = 'astro-1' } | ConvertTo-Json)

$sessionId = $session.data.id
$body = @{
  clientMessageId = 'local-message-1'
  text = 'Ho dormito 4 ore. Qualita del sonno 2 su 10. Stanchezza 4 su 10.'
  inputMode = 'TEXT'
} | ConvertTo-Json

$turn = Invoke-RestMethod -Method Post -Uri "$base/sessions/$sessionId/messages" `
  -Headers $headers -ContentType 'application/json' -Body $body
$turn.data.assistantMessage.text
$turn.data.checkIn

Invoke-RestMethod -Method Get -Uri "$base/sessions/$sessionId" -Headers $headers
```

Repeating the same body with the same `clientMessageId` returns the same saved turn, without a new AI call. Reusing the ID with different text or `inputMode` returns 409 `IDEMPOTENCY_CONFLICT`. A new message uses a new ID. Each session belongs to `astro-1`, the only astronaut of the demo identity.

Mock mode has a limited parser and deterministic responses. Supported forms:

- `Ho dormito 5 ore.` or `Ho dormito cinque ore e mezza.`
- `Qualita del sonno 2 su 10.`
- `Stanchezza 4 su 10.`
- `Fisicamente: mi sento affaticato.`

A generic «I slept badly» does not become a number. Ambiguous or unrecognized formulations trigger a clarification request. The mock is designed for reproducible tests, not to interpret every Italian formulation.

With `CONFLICTING_DATA`, the sensor simulates 8 hours while the example declares 4: the assistant exposes the discrepancy and asks for clarification. It does not change the reported value to match the sensor. The mock demonstrative comparison does not constitute a clinical threshold.

## Enabling Nemotron with free prototyping access

The recommended path for prototyping is NVIDIA NIM: NVIDIA documents free API endpoint access for Developer Program members for prototyping, research, and development. An NVIDIA account and API key are required; no OpenAI key is needed. Access is subject to NVIDIA terms and limits and does not equate to a free unlimited production service. Check availability and limits of your account in the [NVIDIA catalog](https://build.nvidia.com/explore/discover). Source: [official NIM FAQ](https://docs.api.nvidia.com/nim/docs/product).

1. Access the NVIDIA catalog and join the Developer Program if required.
2. Search for `nvidia/nemotron-3.5-super-vl-120b-a12b` and generate an API key in your account.
3. Insert the key only in the local `.env` file, keeping the T1 demo bootstrap:

```dotenv
AGENT_DEMO_ENABLED=true
AGENT_DEMO_TOKEN=<token-locale-privato-di-almeno-16-caratteri>
AGENT_AI_PROVIDER=nvidia
NVIDIA_API_KEY=<chiave-api-nvidia>
NVIDIA_MODEL=nvidia/nemotron-3.5-super-vl-120b-a12b
```

The demo token is a local credential chosen by you to access our APIs; `NVIDIA_API_KEY` is the key released by NVIDIA, used only by the server toward the model. Restart `npm run dev` after changing configuration. Test calls in the PowerShell section remain identical.

The adapter calls `https://integrate.api.nvidia.com/v1/chat/completions` without streaming and with intermediate reasoning disabled. The default model is Nemotron 3.5 Super VL; `NVIDIA_MODEL` allows selecting another Nemotron accessible to the account and compatible with the same parameters. The [API reference](https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3_5-super-vl-120b-a12b-infer) describes endpoints and the `reasoning_effort: none` parameter used to disable intermediate reasoning.

The JSON schema is included in the instructions and verified locally. The adapter does not require `response_format`, maintaining local control even for models configured without constrained generation. The code does not assume the provider guarantees the schema. It accepts JSON or a single Markdown block containing the entire JSON; it rejects surrounding text, truncated responses, refusals, tool calls, and invalid objects. The orchestrator's provenance check remains mandatory before saving.

A NVIDIA limit returns 429 `RATE_LIMITED`; wrong key or inaccessible model produce an explicit provider error. A pending HTTP 202 response produces a retryable 503, without saving a half turn. No automatic retries or fallback to OpenAI or mock are provided. In this way exceeding limits does not activate another service.

`AGENT_AI_PROVIDER=mock` remains the default value to start tests without account or network; with `nvidia` the agent uses the real model. No additional SDK dependencies are required.

NVIDIA transport and integration with core controls are tested with simulated HTTP and with a two-turn live test through Next.js. The previous Nano returned HTTP 410: the default model has been updated to the available Super VL. The test verifies a demonstrative path with fictitious data, not clinical validation or exhaustive response quality.

## Optional OpenAI alternative

The OpenAI adapter remains available for compatibility, with separate billing/credits according to your account. It is not necessary to use Nemotron and is never selected automatically. To enable it explicitly, configure on the server:

```dotenv
AGENT_AI_PROVIDER=openai
OPENAI_API_KEY=<chiave-server>
OPENAI_MODEL=<modello-abilitato-per-Responses-e-Structured-Outputs>
```

The model is mandatory and is not hardcoded in the code. The provider uses the Responses API with a JSON Schema derived from contracts, strict structured output, `store: false` and no tools. It does not use silent fallback to mock. Disabling API response saving does not replace verification of the provider's data processing policy before using real data.

References: [Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).

JSON generation constrains the format; it does not by itself demonstrate that every extracted piece of information is correct. The orchestrator checks provenance and structural consistency; subsequent human confirmation of the check-in remains necessary.

OpenAI adapter transport is tested with simulated HTTP responses. No keys are needed for tests and no paid calls are made during the suite. Verification with the actually chosen model requires a key and must be performed before the real demo.

## Configuration and limits

| Variable | Default / meaning |
| --- | --- |
| `AGENT_DEMO_ENABLED` | `false`; explicit local bootstrap, prohibited in production |
| `AGENT_DEMO_TOKEN` | Required for demo, 16–512 characters |
| `AGENT_DEMO_SCENARIO` | `RESTED`; also `POOR_SLEEP`, `CONFLICTING_DATA` |
| `AGENT_AI_PROVIDER` | `mock`; `nvidia` for real Nemotron, `openai` as optional alternative |
| `NVIDIA_API_KEY` | Required only for `nvidia`; not sent to the browser |
| `NVIDIA_MODEL` | `nvidia/nemotron-3.5-super-vl-120b-a12b` if omitted |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Required only for `openai` |
| `AGENT_AI_TIMEOUT_MS` | 30000; from 100 to 120000 ms |
| `AGENT_CONTEXT_MESSAGE_LIMIT` | 20; from 1 to 100 current messages, including the last |
| `AGENT_PREVIOUS_CHECK_IN_LIMIT` | 3; from 0 to 10 confirmed check-ins of the same astronaut |

The orchestrator reads sensors from the last 24 hours and passes to the model at most the last 48 readings. The program is requested for the current UTC date; bootstrap uses `Etc/UTC`. Linking to an operational day with another time zone must be agreed with the program provider.

Serialized context is limited to 64000 characters. If necessary, older historical check-ins are removed first, then older messages, then older readings. The last message, current draft, and program snapshot are not truncated; if they alone exceed the limit, the service returns an explicit error.

The JSON HTTP request is limited to 64 KiB effective, even without `Content-Length`. Messages maintain the 8000 character contract limit. Sessions are persisted in the local database; define a retention policy before using real data.

## Orchestrator behavior

1. Authorizes verified identity and astronaut scope.
2. Retrieves any already saved turn with the same client ID.
3. Rejects closed sessions or confirmed check-ins for new messages.
4. Retrieves in parallel sensors, program, and authorized memory.
5. Sends limited context to the provider, separate from fixed instructions.
6. Applies deadline and cancellation even if an adapter ignores the abort signal.
7. Validates schema, missing fields, and evidence references.
8. Assigns server-side ID and timestamp and saves messages and new draft revision together.

AI output is always untrusted. A new observation or correction must cite the astronaut's last message; it cannot cite assistant responses, other sessions, or invented IDs. Previous observations must be preserved in the snapshot; ID and provenance unchanged are maintained even when the original message is outside the limited context.

No observation is shared automatically: the astronaut selects `sharedObservationIds` at confirmation. Conversation does not have write access to the program. NVIDIA and mock also implement report and diary capabilities; OpenAI for now supports only conversation.

In case of invalid output, wrong references, timeout, or model error, no half turn is saved. The client can retry with the same ID. Identical in-progress requests share a call in the single process; the Prisma repository manages deduplication and revision in a transaction. Two different messages on the same revision do not overwrite each other: one receives a conflict and must re-read the state before retrying. The client should send one turn at a time.

## Integration with N1 and dashboard

Main files:

| File | Responsibility |
| --- | --- |
| `server/agent/core/conversation-service.ts` | Conversation logic, without Next or Prisma dependencies |
| `server/agent/ports.ts` | `ConversationRepository`, provider and capabilities |
| `server/agent/runtime.ts` | Composition point with Prisma repository and demo providers |
| `server/agent/http/conversation-handlers.ts` | Identity, JSON, envelope and HTTP codes |
| `server/agent/prompts/conversation.ts` | Instructions for real provider |
| `server/agent/adapters/conversation-ai-factory.ts` | Explicit selection between mock, NVIDIA and OpenAI |
| `server/agent/adapters/nvidia-conversation-ai.ts` | Nemotron call and result validation |
| `app/api/agent/v1/sessions/**/route.ts` | Thin Next.js routes |

The Prisma repository implements `AgentRepository`; the `ConversationRepository` subset is compatible with C0 signatures. `commitTurn` deduplicates and checks revision, saving messages and draft in a transaction. Model calls remain outside the transaction.

For future integration, replace demo identity and context provider with shared adapters, then create the service:

```ts
const service = createConversationService({
  repository: prismaAgentRepository,
  ai: conversationAiProvider,
  sensors: sensorProvider,
  schedule: scheduleReader,
});
const handlers = createConversationHttpHandlers(() => ({
  identity: sharedIdentityProvider,
  service,
}));
```

The names in the example indicate implementations to be provided; they are not already present modules. Identity is resolved on each request and passed to service methods, not fixed in its instance. The service receives only `ScheduleReader`, without `applyApproved`.

For Fabrizio: use the three v1 contract routes already implemented; the message response includes both the text to display and the structured draft. No React component is mandatory. Handle 401/403/404, 409, 429, 502/1003/1004 and allow retry with the same ID. Private responses have `Cache-Control: no-store`. Cookie integration uses common origin; requests with cookie and a different origin are rejected. No permissive CORS is configured.

## Verification

### Automatic test with real model

Requires Node.js 20.12 or later and `.env` configured for NVIDIA. In a terminal start `npm run dev`; in a second terminal, from the repo root:

```text
npm run test:agent:live
```

If the server uses another port, for example that of the local test run during development:

```text
npm run test:agent:live -- --base-url http://127.0.0.1:3101
```

On PowerShell use `npm.cmd` if necessary. The command reads tokens from `.env` without printing them, uses two fictitious messages and shows agent responses. Verifies extraction, check-in continuity, retry without duplicates, 401 without authentication and 409 with reused ID for different text. The two generations consume your account's NVIDIA quota; subsequent verifications do not generate other AI responses. It does not modify the program and does not send reports to Terra.

The test URL is limited to localhost. Fictitious data remain in the local database even after restart. For a manual conversation use the PowerShell calls reported above, changing `clientMessageId` at each new turn.

### Automatic checks without model calls

```text
npm run test:agent
npm run typecheck
npm run lint
npm run build
```

Tests cover text path, missing and conflicting data, corrections, retry, concurrency, astronaut isolation, closed sessions, invalid AI output, timeout, simulated NVIDIA/OpenAI transports, provider selection and HTTP errors. The test through Next.js also verifies that the shared runtime works between separately compiled routes.
