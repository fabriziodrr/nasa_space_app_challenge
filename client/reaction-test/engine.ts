import { REACTION_DURATION_MS, REACTION_PROTOCOL, ReactionResultSchema, type ReactionResult, type ReactionTrial } from "./contract";

type Phase = "waiting" | "stimulus" | "finished";
export class ReactionEngine {
  private phase: Phase = "waiting";
  private readonly startedWall: number;
  private readonly startedMono: number;
  private nextStimulus: number;
  private shownAt: number | null = null;
  private lastTick: number;
  private trials: ReactionTrial[] = [];
  constructor(private readonly random = Math.random, private readonly mono = () => performance.now(), private readonly wall = () => Date.now()) {
    this.startedMono = mono(); this.lastTick = this.startedMono; this.startedWall = wall(); this.nextStimulus = this.startedMono + this.delay();
  }
  private delay() { return 2000 + Math.floor(this.random() * 3000); }
  private elapsed(now: number) { return Math.max(0, now - this.startedMono); }
  tick(): { phase: Phase; remainingMs: number; result?: ReactionResult } {
    const now = this.mono();
    const elapsed = this.elapsed(now);
    if (now - this.lastTick > 1000) return { phase: "finished", remainingMs: 0, result: this.finish("timing_unreliable") };
    this.lastTick = now;
    if (Math.abs((this.wall() - this.startedWall) - elapsed) > 2000) return { phase: "finished", remainingMs: 0, result: this.finish("clock_changed") };
    if (elapsed >= REACTION_DURATION_MS) return { phase: "finished", remainingMs: 0, result: this.finish(null) };
    if (this.phase === "stimulus" && this.shownAt !== null && now - this.shownAt >= 1500) {
      this.trials.push({ status: "missed", rt_ms: null, stimulus_offset_ms: this.elapsed(this.shownAt) });
      if (this.trials.length >= 1000) return { phase: "finished", remainingMs: REACTION_DURATION_MS - elapsed, result: this.finish("input_limit") };
      this.phase = "waiting"; this.shownAt = null; this.nextStimulus = now + this.delay();
    }
    if (this.phase === "waiting" && now >= this.nextStimulus && elapsed + 1500 <= REACTION_DURATION_MS) {
      this.phase = "stimulus"; this.shownAt = null;
    }
    return { phase: this.phase, remainingMs: Math.max(0, REACTION_DURATION_MS - elapsed) };
  }
  markDisplayed() { if (this.phase === "stimulus" && this.shownAt === null) this.shownAt = this.mono(); }
  respond() {
    const current = this.tick();
    if (current.phase === "finished") return current;
    const now = this.mono();
    if (this.phase === "stimulus" && this.shownAt !== null) {
      const rt = now - this.shownAt;
      this.trials.push(rt < 100
        ? { status: "false_start", rt_ms: null, stimulus_offset_ms: this.elapsed(this.shownAt) }
        : { status: "response", rt_ms: Math.min(1500, rt), stimulus_offset_ms: this.elapsed(this.shownAt) });
      this.phase = "waiting"; this.shownAt = null; this.nextStimulus = now + this.delay();
    } else this.trials.push({ status: "false_start", rt_ms: null, stimulus_offset_ms: null });
    if (this.trials.length >= 1000) return { phase: "finished" as const, remainingMs: current.remainingMs, result: this.finish("input_limit") };
    return { phase: this.phase, remainingMs: current.remainingMs };
  }
  finish(reason: "user" | "hidden" | "clock_changed" | "timing_unreliable" | "input_limit" | null): ReactionResult {
    this.phase = "finished";
    return ReactionResultSchema.parse({ schema_version: "1", protocol_id: REACTION_PROTOCOL,
      started_at: new Date(this.startedWall).toISOString(), ended_at: new Date(this.wall()).toISOString(), elapsed_ms: this.elapsed(this.mono()),
      status: reason ? "interrupted" : "completed", interruption: reason, trials: this.trials });
  }
}
