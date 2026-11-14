import { randomUUID } from "node:crypto";

/** Stable, contract-compliant opaque identifier (alphanumeric + `-`/`_`). */
export function randomId(prefix: string): string {
  return `${prefix}-${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}
