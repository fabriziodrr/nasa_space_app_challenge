// Check-in correction and confirmation. The repository enforces atomic revision
// checks and idempotent confirmation; this service maps the verified identity to the
// astronaut scope and checks sharing against the current draft.
import type {
  CheckIn, ConfirmCheckInRequest, Identity, UpdateCheckInRequest,
} from "../contracts";
import type { AgentRepository } from "../ports";
import { AgentErrors } from "../core/errors";

export class CheckInService {
  constructor(private readonly repository: AgentRepository) {}

  async update(
    identity: Identity,
    checkInId: string,
    request: UpdateCheckInRequest,
  ): Promise<CheckIn> {
    const astronautId = this.#assertAstronaut(identity);
    const draft = await this.repository.getCheckIn(astronautId, checkInId);
    if (!draft) throw AgentErrors.notFound();
    if (draft.status !== "DRAFT") throw AgentErrors.invalidState("Il check-in confermato non puo essere corretto.");
    for (const observation of request.observations) {
      const sameField = draft.observations.find((item) => item.field === observation.field);
      const sameId = draft.observations.find((item) => item.id === observation.id);
      if ((sameField && sameField.id !== observation.id) || (sameId && sameId.field !== observation.field)) {
        throw AgentErrors.invalidState("La correzione deve mantenere l'identita delle osservazioni esistenti.");
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
      if (cursor && seenCursors.has(cursor)) throw AgentErrors.internal("Paginazione dei messaggi non valida.");
      if (cursor) seenCursors.add(cursor);
    } while (remaining.size && cursor);
    if (remaining.size) throw AgentErrors.invalidState("Le osservazioni devono riferirsi ai messaggi dell'astronauta nella sessione.");
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
      throw AgentErrors.invalidState("La selezione condivisa include osservazioni assenti dalla bozza.");
    }
    return this.repository.confirmCheckIn(astronautId, checkInId, request);
  }

  #assertAstronaut(identity: Identity): string {
    if (identity.role !== "ASTRONAUT") throw AgentErrors.forbidden("Operazione riservata all'astronauta.");
    return identity.astronautId;
  }
}
