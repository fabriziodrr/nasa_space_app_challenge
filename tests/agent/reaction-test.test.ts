import assert from "node:assert/strict";
import { test } from "node:test";
import { ReactionEngine } from "../../client/reaction-test/engine";
import { REACTION_DURATION_MS, ReactionResultSchema, summarizeReaction } from "../../client/reaction-test/contract";

test("reaction test records signals, early responses and misses without fabricating measurements", () => {
  let time = 0;
  const engine = new ReactionEngine(() => 0, () => time, () => 1700000000000 + time);
  const advance = (ms: number) => { for (let i = 0; i < ms; i += 100) { time += 100; engine.tick(); } };
  engine.respond(); // Early response before the first signal.
  advance(2000); engine.markDisplayed(); advance(300); engine.respond();
  advance(2000); engine.markDisplayed(); advance(1500);
  const result = engine.finish("user");
  assert.equal(result.status, "interrupted");
  assert.deepEqual(result.trials.map((trial) => trial.status), ["false_start", "response", "missed"]);
  assert.deepEqual(summarizeReaction(result.trials), { response_count: 1, median_rt_ms: 300, false_start_count: 1, missed_count: 1, lapse_count: 0 });
  assert.equal(ReactionResultSchema.safeParse(result).success, true);
});

test("test completes only after three minutes and interrupts unreliable timing", () => {
  let time = 0;
  const engine = new ReactionEngine(() => 0, () => time, () => 1700000000000 + time);
  let result;
  while (time < REACTION_DURATION_MS) { time += 100; const update = engine.tick(); if (update.phase === "stimulus") engine.markDisplayed(); result = update.result ?? result; }
  assert.equal(result?.status, "completed");
  assert.equal(result?.elapsed_ms, REACTION_DURATION_MS);
  let otherTime = 0;
  const delayed = new ReactionEngine(() => 0, () => otherTime, () => 1700000000000 + otherTime);
  otherTime = 2000;
  assert.equal(delayed.tick().result?.interruption, "timing_unreliable");
});
