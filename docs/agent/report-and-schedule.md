# Report, proposal and decision for Terra

The flow is available in the demo runtime with the `mock` provider or NVIDIA/Nemotron. By default, the agent reads synthetic sensors from the Python backend through the adapter described in the [data contract](./contratto-backend-dati.md); identity binding remains demo and unverified. No data is written to the Python backend.

## Behavior

1. The astronaut speaks or writes, verifies check-in, and chooses what to share, including any webcam observation.
2. Upon confirmation, sensors, authorized visual observation, and the program with its version are frozen. Subsequent changes do not rewrite the evaluation context.
3. The agent generates a report for Terra: shared statements, sensor readings with provenance, discrepancies, uncertainties, and need for human review. Evidence refers to IDs of authorized sources.
4. If justified, it generates a `PENDING_REVIEW` proposal; otherwise it provides `noChangeReason`. The program remains unchanged. A proposal that does not pass the validator is discarded: the report remains available and requires human review.
5. Only Terra can approve or reject. Only `APPLIED` means the program has been updated. A repeated decision with the same key and same payload does not apply the change twice.

The diary remains private. The webcam measures eyelid closures in the observed interval: it does not measure sleep hours and does not by itself prove fatigue or a diagnosis. A synthetic or insufficient measure is described in uncertainties, not used as evidence for a proposal.

## Program and demo limits

`DemoProgramProvider` saves the program in Prisma and versions it. Existing programs are preserved. For a date without a program, it creates an illustrative day in UTC, from 06:00 to the following 06:00, with meals, two exercise blocks, connection with Terra, and protected sleep opportunities. Two mission tasks are movable within explicit windows.

The server allows only a positive pause of up to 20 minutes before a single future flexible mission task, moved by the same duration. It verifies windows, duration, dependencies, absence of overlaps, and blocked tasks. It requires shared evidence on rest or fatigue: vision alone is not enough. Upon application, it rechecks persisted approval, authorized command, version, and current time; a window already started is not applied.

In the **mock** provider, the reproducible rule is: reported fatigue of at least 8/10 and sleep of at most 6 hours, with consistent sources. Duration may be reported or come from a `GOOD` quality sensor. A divergence of at least one hour between sensor and statement requires clarification. These thresholds and the 20-minute pause are prototype choices, not clinical or NASA rules. Nemotron evaluates the context with the same modification constraints, without guaranteeing a proposal at every check-in.

### NASA references and their use

- [NASA, Medical Operations](https://www.nasa.gov/reference/6-0-medical-operations/): planning must consider circadian rhythms, work/rest, and task load.
- [NASA, ISS workday](https://www.nasa.gov/missions/station/more-hands-make-light-work-crew-dragon-duo-increases-science-tempo-on-space-station/): describes an example day with mandatory exercise and 8.5-hour sleep opportunity.
- [NASA, improving astronaut sleep](https://www.nasa.gov/missions/station/seven-ways-astronauts-improve-sleep-may-help-you-snooze-better-on-earth/): explains the use of scheduled sleep times.

These sources guide the protected categories. Exact times and demo activity content are our examples; they do not represent an official schedule or a certified protocol.

## API for Emanuel and Fabrizio

Authentication `Authorization: Bearer <token>`. In demo use `AGENT_DEMO_TOKEN` for the astronaut and `AGENT_GROUND_TOKEN` distinct for Terra; both defined on the server. Roles and scope are not read from the body. Real backend credentials will require a dedicated `IdentityProvider`.

| Method and path | Use |
| --- | --- |
| `GET /api/agent/v2/reports?astronautId=astro-1` | Shared reports, including webcam evidence |
| `GET /api/agent/v2/proposals?astronautId=astro-1` | Proposals and status; `cursor` and `limit` optional |
| `GET /api/agent/v2/schedule?astronautId=astro-1&date=2026-11-14` | Persistent schedule for the requested date |
| `PUT /api/agent/v2/schedule` | Terra sets the shared schedule via version control |
| `POST /api/agent/v2/proposals/:id/decision` | Terra's decision |

Positive responses contain `{ data, meta: { contractVersion: "2.0.0", requestId } }`, with `Cache-Control: no-store`. Schemas and types importable from the frontend: `server/agent/contracts/index.ts`, including `ProposalListV2ResponseSchema`, `DecisionV2ResponseSchema` and `ScheduleV2ResponseSchema`.

Example decision:

```http
POST /api/agent/v2/proposals/<proposal-id>/decision
Authorization: Bearer <token-terra>
Content-Type: application/json
Idempotency-Key: decisione-univoca-1

{ "decision": "APPROVE", "comment": "Compatibile con le attività previste." }
```

To reject use `REJECT`. `comment` is mandatory but can be `null`. The response contains `{ decision, proposal, schedule }`: `schedule` is populated only for `APPLIED`. `REJECTED` does not change the schedule; an outdated version produces `409 VERSION_CONFLICT` and `STALE`. An approval with failed application returns status `APPLY_FAILED`, without presenting it as applied. A timeout does not justify a second request with a different key: repeat the original request.

### Setting the schedule from Terra

The demo program has a single authoritative source: `DemoProgramProvider` and the agent's Prisma database. Dashboard and other components read it via `GET /api/agent/v2/schedule`, with authorized identity. The Python sensor backend is not a second schedule store. To modify it, Terra retrieves the snapshot and sends the updated one:

```http
PUT /api/agent/v2/schedule
Authorization: Bearer <token-terra>
Content-Type: application/json

{ "expectedVersion": 1, "schedule": { ...snapshot_aggiornato_con_version_1 } }
```

The illustrated body requires the full object returned by GET, with `id`, `astronautId`, `date` and `version` unchanged; the executable schema is `UpdateScheduleRequestSchema`. The server validates activities, day boundaries, overlaps, and dependencies and increments the version atomically. An astronaut receives `403`; an outdated version receives `409 VERSION_CONFLICT` with `currentVersion`: reload and review the schedule before retrying. A repeated `PUT` after success with the old version therefore receives `409`; after a timeout, reload the schedule to verify the outcome. A previous proposal becomes `STALE` upon decision attempt if the version has changed.

This API allows Fabrizio to connect the dashboard; the edit screen is not yet present. The schedule remains a local simulation: real program ownership and the final authentication system must be agreed with the team.

Confirmation with webcam choice uses `POST /api/agent/v2/check-ins/:id/confirm`; messages continue to use existing session APIs. For confirmation and consent details see [I1](./i1-vision-import.md) and schema `ConfirmCheckInWithVisionRequestSchema`.

## Setup and verification

With the server stopped, after updating the code:

```powershell
npm.cmd run db:generate
npm.cmd run db:push
npm.cmd run test:agent
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run dev
```

The schema adds the optional field `CheckInContextSnapshot.scheduleJson`. No need to reset the database. For old check-ins without frozen program, a new proposal requires a new check-in.

To try manually without external APIs set `AGENT_AI_PROVIDER=mock`, `AGENT_SENSOR_PROVIDER=mock` and `AGENT_DEMO_SCENARIO=POOR_SLEEP` in `.env`, restart the server and open `/voice-demo`. Write "I slept 4.5 hours. Sleep quality 3 out of 10. Fatigue 8 out of 10.", share observations and confirm. The proposal requires an eligible future task: after the last flexible task it is correct to get a no-change reason. The current demo does not include a new decision screen: use the APIs above.

Reproducible scenarios without depending on real time are in `tests/agent/planning-flow.test.ts`: temporary databases, fixed clock before tasks, poor sleep with proposal, adequate rest without proposal, insufficient data, idempotent approval, rejection, permissions, and outdated version. `tests/agent/artifacts.test.ts` also verifies that an invalid recommendation does not delete the report.

## Next connection

With Emanuel, common identity remains to be verified and the system that will own the schedule beyond the demo must be agreed; the real provider must maintain version comparison, idempotency, and application receipt. Fabrizio's dashboard can consume the contracts above to show reports, reason, before/after difference, and buttons reserved for Terra. The current link to the Python backend is read-only.
