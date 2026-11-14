import { z } from "zod";

export const CONTRACT_VERSION = "1.0.0" as const;
export const IdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
export const TextSchema = z.string().trim().min(1).max(8000);
export const TimestampSchema = z.iso.datetime(); // UTC, with a trailing Z.
export const VersionSchema = z.number().int().positive();
export const ScenarioSchema = z.enum(["RESTED", "POOR_SLEEP", "CONFLICTING_DATA"]);
export const TimeZoneSchema = z.string().max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Expected a supported IANA time zone");

export const AstronautIdentitySchema = z.strictObject({
  userId: IdSchema,
  role: z.literal("ASTRONAUT"),
  astronautId: IdSchema,
});
export const GroundIdentitySchema = z.strictObject({
  userId: IdSchema,
  role: z.literal("GROUND_CONTROL"),
  astronautIds: z.array(IdSchema).min(1).max(100),
});
export const IdentitySchema = z.discriminatedUnion("role", [
  AstronautIdentitySchema, GroundIdentitySchema,
]);

export const ERROR_HTTP_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  INVALID_STATE: 409,
  IDEMPOTENCY_CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_AUDIO: 415,
  RATE_LIMITED: 429,
  INVALID_AI_OUTPUT: 502,
  PROVIDER_UNAVAILABLE: 503,
  PROVIDER_TIMEOUT: 504,
  INTERNAL_ERROR: 500,
} as const;
export const ErrorCodeSchema = z.enum(Object.keys(ERROR_HTTP_STATUS) as [
  keyof typeof ERROR_HTTP_STATUS, ...Array<keyof typeof ERROR_HTTP_STATUS>,
]);
export const ApiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: ErrorCodeSchema,
    message: TextSchema,
    requestId: IdSchema,
    retryable: z.boolean(),
    issues: z.array(z.strictObject({
      path: z.string().max(200),
      message: z.string().max(500),
    })).max(100),
    currentVersion: VersionSchema.optional(),
  }),
});

export type Identity = z.infer<typeof IdentitySchema>;
export type AstronautIdentity = z.infer<typeof AstronautIdentitySchema>;
export type GroundIdentity = z.infer<typeof GroundIdentitySchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;
