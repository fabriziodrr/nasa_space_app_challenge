import { NextResponse } from "next/server";

// The demo proxy is deliberately limited to synthetic observations.
const backend = process.env.AEGIS_DATA_API_URL ?? "http://127.0.0.1:8000";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const subject = query.get("subject") ?? "";
  const start = query.get("start") ?? "";
  const end = query.get("end") ?? "";
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(subject) || !start || !end) {
    return NextResponse.json({ error: "Subject and date range are required." }, { status: 400 });
  }
  const params = new URLSearchParams({ start, end, synthetic: "true" });
  try {
    const response = await fetch(`${backend}/v1/subjects/${encodeURIComponent(subject)}/sleep-analysis?${params}`, { cache: "no-store" });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch {
    return NextResponse.json({ error: "Data backend unavailable. Start the Python API on port 8000." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const records: unknown = await request.json();
    if (!Array.isArray(records) || records.length === 0 || records.length > 10000 ||
        records.some((row) => typeof row !== "object" || row === null || row.synthetic !== true)) {
      return NextResponse.json({ error: "Only JSON arrays of explicitly synthetic observations are supported." }, { status: 400 });
    }
    const response = await fetch(`${backend}/v1/observations/import`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(records), cache: "no-store",
    });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch {
    return NextResponse.json({ error: "Could not import JSON. Check the file and data backend." }, { status: 503 });
  }
}
