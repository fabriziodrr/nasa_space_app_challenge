// Timestamp helpers: contract timestamps are whole-second ISO 8601 UTC strings.
export function toIso(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function toDate(value: string): Date {
  return new Date(value);
}

export function nowIso(): string {
  return toIso(new Date());
}
