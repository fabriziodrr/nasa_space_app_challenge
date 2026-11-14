// Simulated identity provider for local development only. It never constructs a
// role from request JSON: it maps a demo bearer token to a seeded DemoIdentity row.
import type { PrismaClient } from "@prisma/client";
import type { AstronautIdentity, GroundIdentity, Identity } from "../contracts";
import type { IdentityProvider } from "../ports";

export class SimulatedIdentityProvider implements IdentityProvider {
  private readonly enabled: boolean;

  constructor(
    private readonly prisma: PrismaClient,
    options: { enabled?: boolean } = {},
  ) {
    this.enabled = options.enabled ?? process.env.NODE_ENV !== "production";
    if (this.enabled && process.env.NODE_ENV === "production") {
      throw new Error("SimulatedIdentityProvider non puo essere abilitato in produzione.");
    }
  }

  async authenticate(credentials: {
    authorizationHeader: string | null;
    sessionCookie: string | null;
  }): Promise<Identity | null> {
    if (!this.enabled) return null;
    const match = /^Bearer\s+demo-([A-Za-z0-9_-]{1,128})$/i.exec(credentials.authorizationHeader ?? "");
    if (!match) return null;
    const row = await this.prisma.demoIdentity.findUnique({ where: { id: match[1] } });
    if (!row) return null;
    if (row.role === "ASTRONAUT" && row.astronautId) {
      return {
        userId: row.id,
        role: "ASTRONAUT",
        astronautId: row.astronautId,
      } satisfies AstronautIdentity;
    }
    return {
      userId: row.id,
      role: "GROUND_CONTROL",
      astronautIds: JSON.parse(row.astronautIdsJson) as string[],
    } satisfies GroundIdentity;
  }
}
