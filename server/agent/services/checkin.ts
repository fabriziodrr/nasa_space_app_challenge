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
