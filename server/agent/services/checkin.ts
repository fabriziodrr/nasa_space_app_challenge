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
    const observations = request.observations.map((observation) => {
      if (observation.field !== "SLEEP_QUALITY" && observation.field !== "FATIGUE") return observation;
      const previous = draft.observations.find((item) => item.id === observation.id);
      if (previous && previous.field === observation.field && previous.value === observation.value
          && JSON.stringify(previous.messageIds) === JSON.stringify(observation.messageIds)) return previous;
      if (observation.scaleMax !== 10) throw AgentErrors.invalidState("Per una nuova valutazione serve la scala esplicita 1–10.");
      return { ...observation, scaleMax: 10 as const };
    });
    return this.repository.updateCheckIn(astronautId, checkInId, { ...request, observations });
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
    if (this.visionConfirmation) return (await this.visionConfirmation.confirm(astronautId, checkInId, {
      ...request, vision: { visionObservationId: null, shareWithGround: false },
    })).checkIn;
    return this.repository.confirmCheckIn(astronautId, checkInId, request);
  }

  #assertAstronaut(identity: Identity): string {
    if (identity.role !== "ASTRONAUT") throw AgentErrors.forbidden("Operazione riservata all'astronauta.");
    return identity.astronautId;
  }
}
