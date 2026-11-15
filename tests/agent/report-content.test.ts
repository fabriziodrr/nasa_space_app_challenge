import { test } from "node:test";
import assert from "node:assert/strict";
import { reportContent, reportSource } from "../../client/dashboard/report-content";

test("report content shows readable messages without serialized technical fields", () => {
  assert.equal(reportContent('{"id":"private-id","content":{"text":"Slept well"}}'), "Slept well");
  assert.equal(reportContent('{"id":"123","value":7.5,"unit":"h"}'), "7.5 h");
  assert.equal(reportContent('[{"message":"Eyes closed"},{"message":"Data incomplete"}]'), "Eyes closed · Data incomplete");
  assert.equal(reportContent('{"id":"123","timestamp":"2026-01-01"}'), "Content unavailable.");
  assert.equal(reportContent("Sleep duration: 7 h."), "Sleep duration: 7 h.");
  assert.equal(reportSource("self_report"), "Data from speech");
});
