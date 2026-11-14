import { z } from "zod";
import { ConversationOutputSchema, type ConversationOutput } from "../contracts";
import type { ConversationAiProvider, ConversationContext, ProviderOptions } from "../ports";
import { AgentError, invalidAiOutput } from "../core/errors";
import { withDeadline } from "../core/deadline";
import { CONVERSATION_INSTRUCTIONS } from "../prompts/conversation";

const ResponseSchema = z.object({
  status: z.literal("completed"),
  output: z.array(z.object({
    type: z.string(),
    role: z.string().optional(),
    content: z.array(z.object({
      type: z.string(), text: z.string().max(64_000).optional(),
    })).max(20).optional(),
  })).max(30),
});

// Zod emits oneOf/const for discriminated unions. The API subset uses anyOf/enum;
// these branches remain disjoint because every branch has a different field literal.
function structuredSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(structuredSchema);
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (key === "$schema") continue;
      if (key === "const") output.enum = [child];
      else output[key === "oneOf" ? "anyOf" : key] = structuredSchema(child);
    }
    return output;
  }
  return value;
}

export interface OpenAiConversationOptions {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

/** Responses API adapter. Keys/configuration never enter the public contracts. */
export class OpenAiConversationProvider implements ConversationAiProvider {
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  constructor(private readonly options: OpenAiConversationOptions) {
    if (!options.apiKey.trim() || !options.model.trim()) throw new Error("OpenAI key and model are required");
    this.fetcher = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async converse(context: ConversationContext, options?: ProviderOptions): Promise<ConversationOutput> {
    const schema = structuredSchema(z.toJSONSchema(ConversationOutputSchema));
    return withDeadline(async (signal) => {
      let response: Response;
      try {
        response = await this.fetcher("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: { Authorization: `Bearer ${this.options.apiKey}`, "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            model: this.options.model,
            instructions: CONVERSATION_INSTRUCTIONS,
            input: [{ role: "user", content: JSON.stringify(context) }],
            store: false,
            max_output_tokens: 4000,
            text: { format: { type: "json_schema", name: "astronaut_check_in", strict: true, schema } },
          }),
        });
      } catch {
        if (signal.aborted) throw new AgentError("PROVIDER_TIMEOUT", "Richiesta AI interrotta o scaduta.", true);
        throw new AgentError("PROVIDER_UNAVAILABLE", "Impossibile raggiungere il servizio AI.", true);
      }
      if (!response.ok) {
        // Never return upstream response bodies: they may contain private input or credentials.
        await response.body?.cancel();
        if (response.status === 429) throw new AgentError("RATE_LIMITED", "Il servizio AI ha raggiunto un limite. Riprova piu tardi.", true);
        if (response.status === 408 || response.status === 504) throw new AgentError("PROVIDER_TIMEOUT", "Il servizio AI non ha risposto in tempo.", true);
        throw new AgentError("PROVIDER_UNAVAILABLE", "Servizio AI non disponibile. Verificare la configurazione server.", response.status >= 500);
      }
      let raw: unknown;
      try { raw = await response.json(); }
      catch { throw invalidAiOutput(); }
      const parsed = ResponseSchema.safeParse(raw);
      if (!parsed.success) throw invalidAiOutput();
      const fragments: string[] = [];
      for (const item of parsed.data.output) {
        if (item.type === "reasoning") continue;
        if (item.type !== "message" || item.role !== "assistant" || !item.content?.length) throw invalidAiOutput();
        for (const content of item.content) {
          if (content.type !== "output_text" || !content.text) throw invalidAiOutput();
          fragments.push(content.text);
        }
      }
      if (!fragments.length) throw invalidAiOutput();
      try {
        return ConversationOutputSchema.parse(JSON.parse(fragments.join("")));
      } catch { throw invalidAiOutput(); }
    }, this.timeoutMs, options?.signal);
  }
}
