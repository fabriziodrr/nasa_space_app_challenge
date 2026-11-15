/** Extract reader-facing content from legacy JSON-encoded report text. */
export function reportContent(input: unknown): string {
  function read(value: unknown, depth: number): string {
    if (depth > 5 || value == null) return "";
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    if (typeof value === "string") {
      const text = value.trim();
      if (!text) return "";
      if (/^[\[{"\]]/.test(text)) {
        try { return read(JSON.parse(text), depth + 1); } catch { /* Ordinary text. */ }
      }
      return text;
    }
    if (Array.isArray(value)) return value.map((item) => read(item, depth + 1)).filter(Boolean).join(" · ");
    if (typeof value !== "object") return "";
    const record = value as Record<string, unknown>;
    for (const key of ["content", "message", "text", "description", "summary", "notification"]) {
      if (record[key] != null) {
        const content = read(record[key], depth + 1);
        if (content) return content;
      }
    }
    if (record.value != null) {
      const content = read(record.value, depth + 1);
      const unit = typeof record.unit === "string" ? record.unit.trim() : "";
      return [content, unit].filter(Boolean).join(" ");
    }
    return "";
  }
  return read(input, 0) || "Content unavailable.";
}

export function reportSource(source: string): string {
  return ({ self_report: "Data from speech", sensor: "Spacecraft data", vision: "Optical sensor", inference: "Agent analysis" } as Record<string, string>)[source] ?? "Report";
}
