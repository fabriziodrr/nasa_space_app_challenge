import assert from "node:assert/strict";
import { test } from "node:test";
import { parseVisionBridgeMessage, visionOrigin, VISION_BRIDGE_CHANNEL } from "../../client/vision/bridge";

test("bridge accepts only the expected frame, origin and bounded message", () => {
  const frame = {} as MessageEventSource;
  const origin = visionOrigin(undefined);
  const event = { origin, source: frame, data: { channel: VISION_BRIDGE_CHANNEL, type: "IMPORT", requestId: "id-1", json: "{}" } };
  assert.equal(parseVisionBridgeMessage(event, origin, frame)?.requestId, "id-1");
  assert.equal(parseVisionBridgeMessage({ ...event, origin: "http://evil.test" }, origin, frame), null);
  assert.equal(parseVisionBridgeMessage({ ...event, source: {} as MessageEventSource }, origin, frame), null);
  assert.equal(parseVisionBridgeMessage({ ...event, data: { ...event.data, json: "x".repeat(10 * 1024 * 1024 + 1) } }, origin, frame), null);
  assert.equal(parseVisionBridgeMessage(event, origin, null), null);
});

test("vision origin rejects credentials, paths and insecure remote endpoints", () => {
  assert.equal(visionOrigin("https://vision.example"), "https://vision.example");
  assert.throws(() => visionOrigin("http://vision.example"));
  assert.throws(() => visionOrigin("https://user:password@vision.example"));
  assert.throws(() => visionOrigin("https://vision.example/path"));
});
