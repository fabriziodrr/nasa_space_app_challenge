import assert from "node:assert/strict";
import { test } from "node:test";
import { BrowserVoiceInput, recognitionError, type Recognition, type SpeechResultEvent, type SpeechErrorEvent } from "../../client/voice/recognition";

class FakeRecognition implements Recognition {
  static last: FakeRecognition;
  lang = ""; continuous = false; interimResults = false;
  onresult: ((event: SpeechResultEvent) => void) | null = null;
  onerror: ((event: SpeechErrorEvent) => void) | null = null;
  onend: (() => void) | null = null;
  stopped = false; aborted = false;
  constructor() { FakeRecognition.last = this; }
  start() {}
  stop() { this.stopped = true; }
  abort() { this.aborted = true; }
}

test("recognition keeps final and interim text separate and never sends a message", () => {
  const updates: [string, string][] = [];
  const ends: boolean[] = [];
  const voice = new BrowserVoiceInput({ SpeechRecognition: FakeRecognition }, {
    onText: (final, interim) => updates.push([final, interim]), onEnd: (hadText) => ends.push(hadText),
    onError: () => assert.fail("unexpected error"),
  });
  voice.start();
  const recognition = FakeRecognition.last;
  assert.equal(recognition.lang, "it-IT");
  recognition.onresult?.({ results: { 0: { isFinal: true, 0: { transcript: "Ho dormito" } }, 1: { isFinal: false, 0: { transcript: "cinque ore" } }, length: 2 } });
  assert.deepEqual(updates, [["Ho dormito", "cinque ore"]]);
  recognition.onresult?.({ results: { 0: { isFinal: true, 0: { transcript: "Ho dormito cinque ore" } }, length: 1 } });
  assert.deepEqual(updates.at(-1), ["Ho dormito cinque ore", ""]);
  voice.stop();
  assert.equal(recognition.stopped, true);
  recognition.onend?.();
  assert.deepEqual(ends, [true]);
  voice.dispose();
});

test("permission errors are understandable and an empty turn remains distinguishable", () => {
  const errors: string[] = []; const ends: boolean[] = [];
  const callbacks = { onText: () => {}, onEnd: (hadText: boolean) => ends.push(hadText), onError: (message: string) => errors.push(message) };
  const voice = new BrowserVoiceInput({ webkitSpeechRecognition: FakeRecognition }, callbacks);
  voice.start();
  FakeRecognition.last.onerror?.({ error: "not-allowed" });
  FakeRecognition.last.onend?.();
  assert.match(errors[0], /Permesso/);
  assert.deepEqual(ends, [true]);
  voice.start();
  FakeRecognition.last.onend?.();
  assert.deepEqual(ends, [true, false]);
  voice.dispose();
  assert.match(recognitionError("network"), /servizio/);
});

test("unsupported browsers and repeated starts fail safely; disposal aborts recording", () => {
  const callbacks = { onText: () => assert.fail(), onEnd: () => assert.fail(), onError: () => assert.fail() };
  const unsupported = new BrowserVoiceInput({}, callbacks);
  assert.equal(unsupported.supported, false);
  assert.throws(() => unsupported.start(), /non supporta/);
  const voice = new BrowserVoiceInput({ SpeechRecognition: FakeRecognition }, callbacks);
  voice.start();
  const recognition = FakeRecognition.last;
  assert.throws(() => voice.start());
  voice.dispose();
  assert.equal(recognition.aborted, true);
  assert.equal(recognition.onresult, null);
  assert.equal(recognition.onend, null);
});
