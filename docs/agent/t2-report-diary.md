# T2: operational report and personal diary

Confirmed check-in starts two separate generations: the report for Earth receives only the observations selected by the astronaut and the simulated sensors; the diary receives the private conversation. The diary is editable only by the astronaut. Report and diary are saved only once per check-in in the SQLite database.

## Local configuration

In `.env` set `AGENT_DEMO_ENABLED=true`, `AGENT_DEMO_TOKEN`, `AGENT_GROUND_TOKEN` (distinct and at least 16 characters), `AGENT_AI_PROVIDER=nvidia`, `NVIDIA_API_KEY` and, optionally, `NVIDIA_MODEL`. The two local tokens authenticating respectively the astronaut and the control room must not be shared in the frontend. In the local file already prepared for this demo both tokens have been generated.

Initialize the database with `npm run db:push`, then start `npm run dev`. The command `db:seed` deletes all demo data: it is not necessary for T2. The runtime uses Prisma and the demo sensor and program providers.

## API flow

1. `POST /api/agent/v1/sessions` and `POST /sessions/:id/messages` create the check-in in draft.
2. `PATCH /check-ins/:id` allows correcting observations with `expectedRevision`.
3. `POST /check-ins/:id/confirm` receives `{ "expectedRevision": 1, "sharedObservationIds": ["id-osservazione"] }`. Only the selected IDs enter the operational context. The response is 202.
4. `GET /sessions/:id` shows `generationStatus`: `NOT_STARTED` (the asynchronous start may still be in progress), `PROCESSING`, `READY` or `FAILED`. The same confirmation can be repeated to retry a failed generation; report and diary are not duplicated.
5. `GET /reports?astronautId=astro-1` returns the report to the astronaut or the authorized control room.
6. `GET /diary?astronautId=astro-1` and `PATCH /diary/:id` are reserved to the astronaut. The edit requires `expectedRevision`, `text` and `status` (`DRAFT` or `CONFIRMED`).

Paths are relative to `/api/agent/v1`. Credentials go in the header `Authorization: Bearer ...`; private responses are `Cache-Control: no-store`. A Terra token is limited to the demo scope `astro-1` and cannot read the diary. The model does not receive transcript or non-shared observations during report generation. Evidence is checked before saving; the diary remains a correctable draft.

To repeat the test with dummy data, start the server and, in a second terminal:

```powershell
npm.cmd run test:agent:t2:live
```

If the server uses port 3101: `npm.cmd run test:agent:t2:live -- --base-url http://127.0.0.1:3101`. The test uses the NVIDIA quota and leaves a dummy session in the database; it does not print credentials. The suite without live calls is `npm.cmd run test:agent`.

## Current limits

- T2 generation uses NVIDIA or the simulated provider. The OpenAI provider implements only conversation.
- Asynchronous generation is started in the local Next process. After a restart during generation, wait for the lease to expire and repeat the same confirmation; for a distributed deployment a persistent queue is needed.
- The program in the runtime remains simulated and read-only: the report does not generate modification proposals. N2 validation and approval services exist, but are not yet connected to the APIs and the authoritative program.
- The generated report is verified for format and references, but requires human review to ascertain text accuracy. The diary is always an editable draft.
