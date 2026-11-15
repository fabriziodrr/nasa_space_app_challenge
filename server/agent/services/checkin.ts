// Check-in correction and confirmation. The repository enforces atomic revision
// checks and idempotent confirmation; this service maps the verified identity to the
// astronaut scope and checks sharing against the current draft.
import type {
  CheckIn, ConfirmCheckInRequest, Identity, UpdateCheckInRequest,
} from "../contracts";
import type { AgentRepository } from "../ports";
import { AgentErrors } from "../core/errors";
import type { VisionConfirmationService } from "../vision/confirmation";

export class CheckInService {
  constructor(private readonly repository: AgentRepository, private readonly visionConfirmation?: VisionConfirmationService) {}

  async update(
    identity: Identity,
    checkInId: string,
    request: UpdateCheckInRequest,
  ): Promise<CheckIn> {
    const astronautId = this.#assertAstronaut(identity);
    const draft = await this.repository.getCheckIn(astronautId, checkInId);
    if (!draft) throw AgentErrors.notFound();
    if (draft.status !== "DRAFT") throw AgentErrors.invalidState("A confirmed check-in cannot be edited.");
    for (const observation of request.observations) {
      const sameField = draft.observations.find((item) => item.field === observation.field);
      const sameId = draft.observations.find((item) => item.id === observation.id);
      if ((sameField && sameField.id !== observation.id) || (sameId && sameId.field !== observation.field)) {
        throw AgentErrors.invalidState("The correction must preserve the identity of existing observations.");
      }
    }
    const remaining = new Set(request.observations.flatMap((observation) => observation.messageIds));
    let cursor: string | undefined;
    const seenCursors = new Set<string>();
    do {
      const state = await this.repository.getSessionState(astronautId, draft.sessionId, cursor);
      if (!state) throw AgentErrors.notFound();
      for (const message of state.messages) if (message.role === "ASTRONAUT") remaining.delete(message.id);
      cursor = state.nextMessageCursor ?? undefined;
      if (cursor && seenCursors.has(cursor)) throw AgentErrors.internal("Invalid message pagination.");
      if (cursor) seenCursors.add(cursor);
    } while (remaining.size && cursor);
    if (remaining.size) throw AgentErrors.invalidState("Observations must refer to the astronaut's messages in the session.");
    return this.repository.updateCheckIn(astronautId, checkInId, request);
  }

  async confirm(
    identity: Identity,
    checkInId: string,
    request: ConfirmCheckInRequest,
  ): Promise<CheckIn> {
    const astronautId = this.#assertAstronaut(identity);
    const draft = await this.repository.getCheckIn(astronautId, checkInId);
    if (!draft) throw AgentErrors.notFound();
    const observationIds = new Set(draft.observations.map((o) => o.id));
    if (!request.sharedObservationIds.every((id) => observationIds.has(id))) {
      throw AgentErrors.invalidState("The shared selection includes observations absent from the draft.");
    }
    if (this.visionConfirmation) return (await this.visionConfirmation.confirm(astronautId, checkInId, {
      ...request, vision: { visionObservationId: null, shareWithGround: false },
    })).checkIn;
    return this.repository.confirmCheckIn(astronautId, checkInId, request);
  }

  #assertAstronaut(identity: Identity): string {
    if (identity.role !== "ASTRONAUT") throw AgentErrors.forbidden("Operation restricted to the astronaut.");
    return identity.astronautId;
  }
}
