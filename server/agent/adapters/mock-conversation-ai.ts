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
      text: `${o.field}: ${o.value}`, source: "self_report" as const,
      evidence: [{ source: "self_report" as const, observationId: o.id }],
    }));
    const visionFinding = vision?.source === "webcam" && vision.usability === "USABLE" ? [{
      text: `Osservazione palpebrale: ${vision.validMs} ms validi, copertura ${vision.coverage}, quota di chiusura ${vision.closureFraction}; intervallo ${vision.startedAt} – ${vision.endedAt}.`,
      source: "vision" as const, evidence: [{ source: "vision" as const, visionObservationId: vision.id }],
    }] : [];
    const sensorFindings = context.sensors.filter((item) => item.quality !== "UNAVAILABLE").map((item) => ({
      text: `Sensore${item.simulated ? " simulato" : ""} ${item.metric}: ${item.value} ${item.unit}, osservato ${item.observedAt}; qualità ${item.quality}.`,
      source: "sensor" as const, evidence: [{ source: "sensor" as const, sensorReadingId: item.id }],
    }));
    const statedSleep = context.checkIn.observations.find((o) => o.field === "SLEEP_HOURS");
    const measuredSleep = context.sensors.find((s) => s.metric === "SLEEP_DURATION" && s.quality !== "UNAVAILABLE");
    const discrepancies = typeof statedSleep?.value === "number" && measuredSleep?.value != null && Math.abs(statedSleep.value - measuredSleep.value) >= 1 ? [{
      text: "Durata del sonno dichiarata e sensore simulato divergono; verificare periodo e attendibilità prima di concludere.", source: "inference" as const,
      evidence: [{ source: "self_report" as const, observationId: statedSleep.id }, { source: "sensor" as const, sensorReadingId: measuredSleep.id }],
    }] : [];
    let proposal: ProposalCandidate | null = null;
    let noChangeReason: string | null = "Nessuna variazione proposta nella simulazione.";
    if (this.options.proposalsEnabled) {
      const fatigue = context.checkIn.observations.find((o) => o.field === "FATIGUE");
      const hours = context.checkIn.observations.find((o) => o.field === "SLEEP_HOURS");
      const sleep = context.sensors.find((s) => s.metric === "SLEEP_DURATION" && s.quality === "GOOD");
      const poorSleep = typeof hours?.value === "number" ? hours.value <= 6 : sleep?.value != null && sleep.value <= 6;
      if (typeof fatigue?.value !== "number" || (typeof hours?.value !== "number" && sleep?.value == null)) {
        noChangeReason = "Dati condivisi insufficienti per motivare una variazione: richiedere un approfondimento umano.";
      } else if (discrepancies.length) {
        noChangeReason = "Dati discordanti: occorre chiarire la durata del riposo prima di proporre una variazione.";
      } else if (fatigue.value >= 4 && poorSleep) {
        const activity = schedule.activities.find((a) => a.movable && a.priority !== "CRITICAL"
          && Date.parse(a.startsAt) >= Date.parse(context.checkIn.confirmedAt)
          && Date.parse(a.endsAt) + 1200000 <= Date.parse(a.latestEnd)
          && !schedule.activities.some((other) => other.id !== a.id && Date.parse(other.startsAt) < Date.parse(a.endsAt) + 1200000
            && Date.parse(other.endsAt) > Date.parse(a.startsAt)));
        if (activity) {
          const pauseEnd = new Date(Date.parse(activity.startsAt) + 1200000).toISOString();
          proposal = { rationale: "Regola dimostrativa: sonno breve e stanchezza elevata riferita; valutare una pausa di 20 minuti prima di un'attività flessibile. Richiesta approvazione di Terra.",
            evidence: [{ source: "self_report", observationId: fatigue.id },
              ...(hours ? [{ source: "self_report" as const, observationId: hours.id }] : [{ source: "sensor" as const, sensorReadingId: sleep!.id }])],
            changes: [{ type: "MOVE_ACTIVITY", activityId: activity.id, startsAt: pauseEnd, endsAt: new Date(Date.parse(activity.endsAt) + 1200000).toISOString() },
              { type: "ADD_REST", activityId: `rest-${context.checkIn.id}`.slice(0, 128), title: "Pausa proposta da valutare", startsAt: activity.startsAt, endsAt: pauseEnd }],
          };
          noChangeReason = null;
        } else noChangeReason = "Nessuna attività futura può essere spostata entro i vincoli del programma; richiedere valutazione a Terra.";
      } else noChangeReason = "Le evidenze condivise non attivano la regola dimostrativa di variazione; mantenere il programma.";
    }
    return {
      report: {
        findings: [...findings, ...sensorFindings, ...visionFinding],
        discrepancies, uncertainties: ["Dati dimostrativi, nessuna valutazione clinica.",
          ...(vision && !visionFinding.length ? [`Misura palpebrale ${vision.source === "synthetic" ? "sintetica" : "insufficiente"}; motivi: ${vision.reasons.join(", ") || "non specificati"}.`] : [])],
        humanReview: { required: discrepancies.length > 0 || context.checkIn.observations.length === 0,
          reason: discrepancies.length ? "Chiarire i dati discordanti con l'astronauta."
            : context.checkIn.observations.length === 0 ? "Mancano dichiarazioni condivise dell'astronauta." : null },
      },
      proposal, noChangeReason,
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
