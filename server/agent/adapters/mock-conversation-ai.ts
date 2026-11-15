import {
  ConversationOutputSchema, ObservationFieldSchema,
  type Observation, type ConversationOutput, type ProposalCandidate,
} from "../contracts";
import type { ConversationAiProvider, ConversationContext, ProviderOptions, OperationalAiProvider, DiaryAiProvider } from "../ports";

const words = ["zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove", "dieci",
  "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove",
  "venti", "ventuno", "ventidue", "ventitre", "ventiquattro"];
const numberPattern = `(?:\\d+(?:[.,]\\d+)?|${[...words].sort((a, b) => b.length - a.length).join("|")})`;
function number(value: string): number {
  const index = words.indexOf(value);
  return index < 0 ? Number(value.replace(",", ".")) : index;
}

/** Deterministic demo parser; not a substitute for natural-language understanding. */
export class MockConversationAiProvider implements ConversationAiProvider, OperationalAiProvider, DiaryAiProvider {
  constructor(private readonly options: { proposalsEnabled?: boolean } = {}) {}
  async generateOperational({ context, schedule }: Parameters<OperationalAiProvider["generateOperational"]>[0]) {
    const vision = context.vision;
    const findings = context.checkIn.observations.map((o) => ({
      text: `${o.field}: ${o.value}${o.field === "FATIGUE" || o.field === "SLEEP_QUALITY" ? (o.scaleMax ? ` / ${o.scaleMax}` : " (unspecified scale)") : ""}`, source: "self_report" as const,
      evidence: [{ source: "self_report" as const, observationId: o.id }],
    }));
    const visionFinding = vision?.source === "webcam" && vision.usability === "USABLE" ? [{
      text: `Eyelid observation: ${vision.validMs} valid ms, coverage ${vision.coverage}, closure fraction ${vision.closureFraction}; interval ${vision.startedAt} – ${vision.endedAt}.`,
      source: "vision" as const, evidence: [{ source: "vision" as const, visionObservationId: vision.id }],
    }] : [];
    const sensorFindings = context.sensors.filter((item) => item.quality !== "UNAVAILABLE").map((item) => ({
      text: `Sensor${item.simulated ? " simulated" : ""} ${item.metric}: ${item.value} ${item.unit}, observed ${item.observedAt}; quality ${item.quality}${item.provenance ? `; period ${item.provenance.periodStart} – ${item.provenance.periodEnd}; device ${item.provenance.deviceId}; method ${item.provenance.method}${item.provenance.aggregation ? `; aggregation ${item.provenance.aggregation}` : ""}; ${item.provenance.identityLink === "demo_mapped" ? "linked demo profile" : "unverified demo subject"}` : ""}.`,
      source: "sensor" as const, evidence: [{ source: "sensor" as const, sensorReadingId: item.id }],
    }));
    const statedSleep = context.checkIn.observations.find((o) => o.field === "SLEEP_HOURS");
    const measuredSleep = context.sensors.find((s) => s.metric === "SLEEP_DURATION" && s.quality === "GOOD" && (!s.provenance || s.provenance.identityLink === "demo_mapped"));
    const discrepancies = typeof statedSleep?.value === "number" && measuredSleep?.value != null && Math.abs(statedSleep.value - measuredSleep.value) >= 1 ? [{
      text: "Reported and simulated sleep durations differ. Verify the period and reliability before drawing conclusions.", source: "inference" as const,
      evidence: [{ source: "self_report" as const, observationId: statedSleep.id }, { source: "sensor" as const, sensorReadingId: measuredSleep.id }],
    }] : [];
    let proposal: ProposalCandidate | null = null;
    let noChangeReason: string | null = "No schedule change proposed in this simulation.";
    if (this.options.proposalsEnabled) {
      const fatigue = context.checkIn.observations.find((o) => o.field === "FATIGUE");
      const hours = context.checkIn.observations.find((o) => o.field === "SLEEP_HOURS");
      const sleep = context.sensors.find((s) => s.metric === "SLEEP_DURATION" && s.quality === "GOOD");
      const poorSleep = typeof hours?.value === "number" ? hours.value <= 6 : sleep?.value != null && sleep.value <= 6;
      if (typeof fatigue?.value !== "number" || (typeof hours?.value !== "number" && sleep?.value == null)) {
        noChangeReason = "Insufficient shared evidence to justify a change. Request human review.";
      } else if (discrepancies.length) {
        noChangeReason = "Conflicting data: clarify sleep duration before proposing a change.";
      } else if (fatigue.scaleMax === 10 && fatigue.value >= 8 && poorSleep) {
        const activity = schedule.activities.find((a) => a.movable && a.priority !== "CRITICAL"
          && Date.parse(a.startsAt) >= Date.parse(context.checkIn.confirmedAt)
          && Date.parse(a.endsAt) + 1200000 <= Date.parse(a.latestEnd)
          && !schedule.activities.some((other) => other.id !== a.id && Date.parse(other.startsAt) < Date.parse(a.endsAt) + 1200000
            && Date.parse(other.endsAt) > Date.parse(a.startsAt)));
        if (activity) {
          const pauseEnd = new Date(Date.parse(activity.startsAt) + 1200000).toISOString();
          proposal = { rationale: "Demo rule: short sleep and high reported fatigue. Consider a 20-minute break before a flexible activity. Ground approval is required.",
            evidence: [{ source: "self_report", observationId: fatigue.id },
              ...(hours ? [{ source: "self_report" as const, observationId: hours.id }] : [{ source: "sensor" as const, sensorReadingId: sleep!.id }])],
            changes: [{ type: "MOVE_ACTIVITY", activityId: activity.id, startsAt: pauseEnd, endsAt: new Date(Date.parse(activity.endsAt) + 1200000).toISOString() },
              { type: "ADD_REST", activityId: `rest-${context.checkIn.id}`.slice(0, 128), title: "Proposed rest break for review", startsAt: activity.startsAt, endsAt: pauseEnd }],
          };
          noChangeReason = null;
        } else noChangeReason = "No future activity can be moved within schedule constraints. Request ground assessment.";
      } else noChangeReason = "Shared evidence does not meet the demo change rule. Keep the schedule.";
    }
    return {
      report: {
        findings: [...findings, ...sensorFindings, ...visionFinding],
        discrepancies, uncertainties: ["Demonstration data; not a clinical assessment.",
          ...(vision && !visionFinding.length ? [`Eyelid measurement ${vision.source === "synthetic" ? "synthetic" : "insufficient"}; reasons: ${vision.reasons.join(", ") || "unspecified"}.`] : [])],
        humanReview: { required: discrepancies.length > 0 || context.checkIn.observations.length === 0,
          reason: discrepancies.length ? "Clarify conflicting data with the astronaut."
            : context.checkIn.observations.length === 0 ? "No shared astronaut statements are available." : null },
      },
      proposal, noChangeReason,
    };
  }

  async generateDiary({ messages }: Parameters<DiaryAiProvider["generateDiary"]>[0]) {
    const text = messages.filter((m) => m.role === "ASTRONAUT").map((m) => m.text).join(" ").slice(0, 7900);
    return { text: text || "No personal observations recorded." };
  }
  async converse(context: ConversationContext, options?: ProviderOptions): Promise<ConversationOutput> {
    options?.signal?.throwIfAborted();
    const current = context.messages.at(-1)!;
    const text = current.text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const observations = structuredClone(context.draft?.observations ?? []);
    const upsert = (field: Observation["field"], value: number | string) => {
      const candidate = {
        id: observations.find((o) => o.field === field)?.id ?? `candidate-${field.toLowerCase()}`,
        field, value, source: "self_report", messageIds: [current.id], recordedAt: current.createdAt,
      } as Observation;
      const index = observations.findIndex((o) => o.field === field);
      if (index < 0) observations.push(candidate);
      else observations[index] = candidate;
    };
    // Support explicit English check-ins while retaining historical Italian inputs.
    const englishHours = [...text.matchAll(/\b(?:i\s+)?slept\s+(\d+(?:[.,]\d+)?)\s+hours?\b/g)];
    if (englishHours.length === 1 && !/\b(?:not|about|around|maybe|or)\b/.test(text)) {
      const value = Number(englishHours[0][1].replace(",", "."));
      if (value >= 0 && value <= 24) upsert("SLEEP_HOURS", value);
    }
    for (const [field, label] of [["SLEEP_QUALITY", "(?:sleep )?quality"], ["FATIGUE", "(?:fatigue|tiredness)"]] as const) {
      const matches = [...text.matchAll(new RegExp(`\\b${label}\\s*(?:is\\s*|:\\s*)?(\\d+)\\s*(?:out of\\s*10|/\\s*10)\\b`, "g"))];
      if (matches.length === 1 && !/\b(?:not|maybe|or)\b/.test(text)) {
        const value = Number(matches[0][1]);
        if (value >= 1 && value <= 10) upsert(field, value);
      }
    }
    // Multiple/negated alternatives are left for clarification, not guessed.
    const hours = [...text.matchAll(new RegExp(`\\bho dormito (${numberPattern}) (?:ore|ora)( e mezz[ao])?\\b`, "g"))];
    if (hours.length === 1 && !/\b(?:non|forse|circa|o)\b/.test(text)) {
      const value = number(hours[0][1]) + (hours[0][2] ? 0.5 : 0);
      if (value >= 0 && value <= 24) upsert("SLEEP_HOURS", value);
    }
    for (const [field, label] of [["SLEEP_QUALITY", "qualita(?: del sonno)?"], ["FATIGUE", "stanchezza"]] as const) {
      const matches = [...text.matchAll(new RegExp(`\\b${label}\\s*(?:e\\s+|: ?)?(${numberPattern})\\s*(?:su\\s*(?:10|dieci)|/\\s*10)\\b`, "g"))];
      if (matches.length === 1 && !/\b(?:non|forse|oppure)\b/.test(text)) {
        const value = number(matches[0][1]);
        if (Number.isInteger(value) && value >= 1 && value <= 10) upsert(field, value);
      }
    }
    const bare = text.trim().match(new RegExp(`^(${numberPattern})[.!?]?$`));
    if (bare) {
      const lastQuestion = [...context.messages].reverse().find((message) => message.role === "ASSISTANT")?.text.toLowerCase() ?? "";
      const value = number(bare[1]);
      if (Number.isInteger(value) && value >= 1 && value <= 10) {
        if (lastQuestion.includes("sleep quality from 1 to 10") || lastQuestion.includes("qualita del sonno da 1 a 10")) upsert("SLEEP_QUALITY", value);
        else if (lastQuestion.includes("tired do you feel from 1 to 10") || lastQuestion.includes("stanco da 1 a 10")) upsert("FATIGUE", value);
      }
    }
    if (/^(?:fisicamente|physically)\s*:/i.test(current.text)) {
      const value = current.text.replace(/^(?:fisicamente|physically)\s*:\s*/i, "").trim();
      if (value) upsert("PHYSICAL_NOTES", value);
    }
    const missingFields = ObservationFieldSchema.options.filter((field) => !observations.some((o) => o.field === field));
    const questions: Record<Observation["field"], string> = {
      SLEEP_HOURS: "How many hours did you sleep?",
      SLEEP_QUALITY: "How would you rate your sleep quality from 1 to 10?",
      FATIGUE: "How tired do you feel from 1 to 10?",
      PHYSICAL_NOTES: "How do you feel physically?",
    };
    const reportedHours = observations.find((o) => o.field === "SLEEP_HOURS")?.value;
    const sensor = context.sensors.find((s) => s.metric === "SLEEP_DURATION" && s.quality === "GOOD" && (!s.provenance || s.provenance.identityLink === "demo_mapped"));
    const discrepancy = typeof reportedHours === "number" && sensor?.value != null
      && Math.abs(sensor.value - reportedHours) >= 1;
    const alreadyAsked = context.messages.some((m) => m.role === "ASSISTANT" && (m.text.includes("same sleep period") || m.text.includes("periodo di riposo")));
    let reply = missingFields.length ? questions[missingFields[0]]
      : "Your check-in draft is ready. Review it and choose what to share with ground control. The schedule is unchanged at this stage.";
    if (discrepancy && !alreadyAsked) {
      reply = `The simulated sensor records ${sensor!.value} hours, while you reported ${reportedHours}. Do these refer to the same sleep period? Both values are retained. ${reply}`;
    }
    const vision = context.visionObservations[0];
    const askedVision = context.messages.some((m) => m.role === "ASSISTANT" && (m.text.includes("eyelid observation") || m.text.includes("osservazione palpebrale")));
    if (vision && !askedVision) {
      const note = vision.source === "synthetic" ? "The eyelid observation is synthetic and does not represent a real measurement."
        : vision.usability === "INSUFFICIENT" ? "The eyelid observation is not usable."
        : vision.prolongedCount > 0 ? "The eyelid observation records prolonged closures. How do you feel right now?"
        : "The eyelid observation is available as context.";
      reply = `${note} ${reply}`;
    }
    return ConversationOutputSchema.parse({
      reply, observations, missingFields,
    });
  }
}
