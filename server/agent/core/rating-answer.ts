import { ObservationFieldSchema, type ConversationOutput, type Observation } from "../contracts";
import type { ConversationContext } from "../ports";

const questions: Record<Observation["field"], string> = {
  SLEEP_HOURS: "How many hours did you sleep?",
  SLEEP_QUALITY: "How would you rate your sleep quality from 1 to 10?",
  FATIGUE: "How tired do you feel from 1 to 10?",
  PHYSICAL_NOTES: "How do you feel physically?",
  MENTAL_STATE: "Is there any background thought occupying your mental space?",
  STRESSOR_NOTES: "If you could eliminate one small annoyance from today, what would it be?",
};

/** Resolve an explicit answer to the preceding rating question without asking an LLM to interpret it. */
export function ratingAnswer(context: ConversationContext): ConversationOutput | null {
  const current = context.messages.at(-1);
  const previous = [...context.messages.slice(0, -1)].reverse().find((item) => item.role === "ASSISTANT");
  if (!current || current.role !== "ASTRONAUT" || !previous || !/\b1\s+to\s+10\b/i.test(previous.text)) return null;
  const field = /sleep quality/i.test(previous.text) ? "SLEEP_QUALITY" : /\b(tired|fatigue)\b/i.test(previous.text) ? "FATIGUE" : null;
  if (!field) return null;
  const match = current.text.trim().toLowerCase().match(/^(?:(?:i (?:would say|rate it)|it(?:'s| is)|my rating is)\s+)?(10|[1-9]|one|two|three|four|five|six|seven|eight|nine|ten)(?:\s*(?:\/|out of)\s*(?:10|ten))?[.!?]?$/);
  if (!match) return null;
  const words = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const value = Number(match[1]) || words.indexOf(match[1]);
  const observations = structuredClone(context.draft?.observations ?? []).filter((item) => item.field !== field);
  observations.push({ id: `candidate-${field.toLowerCase()}`, source: "self_report", field, value,
    scaleMax: 10, messageIds: [current.id], recordedAt: current.createdAt });
  const missingFields = ObservationFieldSchema.options.filter((item) => !observations.some((observation) => observation.field === item));
  return { observations, missingFields, reply: missingFields.length ? questions[missingFields[0]]
    : "Your draft check-in is complete. Review the observations and choose what to share with Houston, then confirm the check-in." };
}
