import { createHash, timingSafeEqual } from "node:crypto";
import type { IdentityProvider } from "../ports";

/** Local demo only: one server-configured token, no role/identity from request JSON. */
export class DemoIdentityProvider implements IdentityProvider {
  private readonly tokenHash: Buffer;
  constructor(token: string) {
    if (token.length < 16) throw new Error("Demo token must be at least 16 characters");
    this.tokenHash = createHash("sha256").update(token).digest();
  }

  async authenticate(credentials: Parameters<IdentityProvider["authenticate"]>[0]) {
    const header = credentials.authorizationHeader;
    if (!header || !header.startsWith("Bearer ") || header.length > 1024) return null;
    const supplied = createHash("sha256").update(header.slice(7)).digest();
    if (!timingSafeEqual(supplied, this.tokenHash)) return null;
    return { userId: "demo-astronaut", role: "ASTRONAUT" as const, astronautId: "astro-1" };
  }
}
