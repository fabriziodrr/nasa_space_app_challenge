import {
  ConversationOutputSchema, ObservationFieldSchema,
  type Observation, type ConversationOutput,
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
  async generateOperational({ context }: Parameters<OperationalAiProvider["generateOperational"]>[0]) {
    return {
      report: {
        findings: context.checkIn.observations.map((o) => ({
          text: `${o.field}: ${o.value}`, source: "self_report" as const,
          evidence: [{ source: "self_report" as const, observationId: o.id }],
        })),
        discrepancies: [], uncertainties: ["Dati dimostrativi, nessuna valutazione clinica."],
        humanReview: { required: false, reason: null },
      },
      proposal: null,
      noChangeReason: "Nessuna variazione proposta nella simulazione.",
    };
  }

  async generateDiary({ messages }: Parameters<DiaryAiProvider["generateDiary"]>[0]) {
    const text = messages.filter((m) => m.role === "ASTRONAUT").map((m) => m.text).join(" ").slice(0, 7900);
    return { text: text || "Nessuna osservazione personale registrata." };
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
    // Multiple/negated alternatives are left for clarification, not guessed.
    const hours = [...text.matchAll(new RegExp(`\\bho dormito (${numberPattern}) (?:ore|ora)( e mezz[ao])?\\b`, "g"))];
    if (hours.length === 1 && !/\b(?:non|forse|circa|o)\b/.test(text)) {
      const value = number(hours[0][1]) + (hours[0][2] ? 0.5 : 0);
      if (value >= 0 && value <= 24) upsert("SLEEP_HOURS", value);
    }
    for (const [field, label] of [["SLEEP_QUALITY", "qualita(?: del sonno)?"], ["FATIGUE", "stanchezza"]] as const) {
      const matches = [...text.matchAll(new RegExp(`\\b${label}\\s*(?:e\\s+|: ?)?(${numberPattern})\\s*(?:su\\s*(?:5|cinque)|/\\s*5)\\b`, "g"))];
      if (matches.length === 1 && !/\b(?:non|forse|oppure)\b/.test(text)) {
        const value = number(matches[0][1]);
        if (Number.isInteger(value) && value >= 1 && value <= 5) upsert(field, value);
      }
    }
    if (/^fisicamente\s*:/i.test(current.text)) {
      const value = current.text.replace(/^fisicamente\s*:\s*/i, "").trim();
      if (value) upsert("PHYSICAL_NOTES", value);
    }
    const missingFields = ObservationFieldSchema.options.filter((field) => !observations.some((o) => o.field === field));
    const questions: Record<Observation["field"], string> = {
      SLEEP_HOURS: "Quante ore hai dormito? Nella demo puoi scrivere: Ho dormito 5 ore.",
      SLEEP_QUALITY: "Come valuti la qualita del sonno da 1 (molto scarsa) a 5 (molto buona)? Scrivi: Qualita del sonno 2 su 5.",
      FATIGUE: "Quanta stanchezza senti da 1 (assente/minima) a 5 (molto elevata)? Scrivi: Stanchezza 4 su 5.",
      PHYSICAL_NOTES: "Come ti senti fisicamente? Nella demo scrivi: Fisicamente: seguito dalla tua descrizione.",
    };
    const reportedHours = observations.find((o) => o.field === "SLEEP_HOURS")?.value;
    const sensor = context.sensors.find((s) => s.metric === "SLEEP_DURATION" && s.quality !== "UNAVAILABLE");
    const discrepancy = typeof reportedHours === "number" && sensor?.value != null
      && Math.abs(sensor.value - reportedHours) >= 1;
    const alreadyAsked = context.messages.some((m) => m.role === "ASSISTANT" && m.text.includes("periodo di riposo"));
    let reply = missingFields.length ? questions[missingFields[0]]
      : "Ho raccolto la bozza del check-in. Potrai verificarla e scegliere quali dati condividere con Terra. Il programma resta invariato in questa fase.";
    if (discrepancy && !alreadyAsked) {
      reply = `Il sensore simulato indica ${sensor!.value} ore, mentre tu ne riferisci ${reportedHours}. Si tratta dello stesso periodo di riposo? Conservo entrambi i valori. ${reply}`;
    }
    const vision = context.visionObservations[0];
    const askedVision = context.messages.some((m) => m.role === "ASSISTANT" && m.text.includes("osservazione palpebrale"));
    if (vision && !askedVision) {
      const note = vision.source === "synthetic" ? "L'osservazione palpebrale è sintetica e non rappresenta una misura reale."
        : vision.usability === "INSUFFICIENT" ? "L'osservazione palpebrale non è sufficientemente utilizzabile."
        : vision.prolongedCount > 0 ? "L'osservazione palpebrale rileva chiusure prolungate. Come ti senti in questo momento?"
        : "L'osservazione palpebrale è disponibile come dato contestuale.";
      reply = `${note} ${reply}`;
    }
    return ConversationOutputSchema.parse({
      reply: `[Simulazione] Sono l'assistente AI di bordo. ${reply}`, observations, missingFields,
    });
  }
}
