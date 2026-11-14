"use strict";

// server/agent/vision/worker-entry.ts
var import_node_worker_threads = require("node:worker_threads");

// server/agent/vision/vendor/contracts/sample.ts
var EYE_INVALIDITY_REASONS = Object.freeze([
  "not_tracked",
  "landmark_missing",
  "low_confidence",
  "geometry_invalid",
  "out_of_range",
  "ambiguous_face",
  "uncalibrated",
  "unknown"
]);

// server/agent/vision/vendor/analysis/config.ts
var DEFAULT_ENGINE_CONFIG = Object.freeze({
  closedEnter: 0.25,
  openExit: 0.4,
  maxGapMs: 250,
  rollingWindowMs: 1e4,
  prolongedClosureMs: 500
});
var DEFAULT_CONFIG_VERSION = "n02-config-v1";
var EngineConfigError = class extends Error {
  constructor(issues) {
    super(`Configurazione del motore non valida: ${issues.join("; ")}`);
    this.name = "EngineConfigError";
    this.issues = Object.freeze([...issues]);
  }
};
function numberOr(value, fallback) {
  return value === void 0 ? fallback : value;
}
function resolveEngineConfig(input = {}) {
  const values = {
    closedEnter: numberOr(input.closedEnter, DEFAULT_ENGINE_CONFIG.closedEnter),
    openExit: numberOr(input.openExit, DEFAULT_ENGINE_CONFIG.openExit),
    maxGapMs: numberOr(input.maxGapMs, DEFAULT_ENGINE_CONFIG.maxGapMs),
    rollingWindowMs: numberOr(input.rollingWindowMs, DEFAULT_ENGINE_CONFIG.rollingWindowMs),
    prolongedClosureMs: numberOr(
      input.prolongedClosureMs,
      DEFAULT_ENGINE_CONFIG.prolongedClosureMs
    )
  };
  const version = input.version === void 0 ? DEFAULT_CONFIG_VERSION : input.version.trim();
  const issues = [];
  if (!Number.isFinite(values.closedEnter) || values.closedEnter < 0 || values.closedEnter >= 1) {
    issues.push("closedEnter deve essere finito e compreso tra 0 e 1, escluso 1");
  }
  if (!Number.isFinite(values.openExit) || values.openExit <= values.closedEnter || values.openExit > 1) {
    issues.push("openExit deve essere finito e maggiore di closedEnter, al massimo 1");
  }
  if (!Number.isFinite(values.maxGapMs) || values.maxGapMs <= 0) {
    issues.push("maxGapMs deve essere finito e maggiore di 0");
  }
  if (!Number.isFinite(values.rollingWindowMs) || values.rollingWindowMs <= 0) {
    issues.push("rollingWindowMs deve essere finito e maggiore di 0");
  }
  if (!Number.isFinite(values.prolongedClosureMs) || values.prolongedClosureMs <= 0) {
    issues.push("prolongedClosureMs deve essere finito e maggiore di 0");
  }
  if (version.length === 0) {
    issues.push("version non pu\xF2 essere vuota");
  }
  if (issues.length > 0) {
    throw new EngineConfigError(issues);
  }
  const configId = [
    version,
    `closedEnter=${values.closedEnter}`,
    `openExit=${values.openExit}`,
    `maxGapMs=${values.maxGapMs}`,
    `rollingWindowMs=${values.rollingWindowMs}`,
    `prolongedClosureMs=${values.prolongedClosureMs}`
  ].join("|");
  return Object.freeze({ version, ...values, configId });
}

// server/agent/vision/vendor/analysis/engine.ts
var SCHEMA_VERSION = "n02-snapshot-v1";
var ENGINE_VERSION = "n02-engine-v1";
var INVALIDITY_REASONS = new Set(EYE_INVALIDITY_REASONS);
var KIND_ORDER = {
  left: 0,
  right: 1,
  bilateral: 2
};
var EngineStateError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "EngineStateError";
  }
};
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function isValidTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
function isValidCalibrationId(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isEyeObservation(value) {
  if (!isRecord(value)) {
    return false;
  }
  if (value.validity === "valid") {
    return typeof value.openness === "number" && Number.isFinite(value.openness);
  }
  if (value.validity === "invalid") {
    return Array.isArray(value.reasons) && value.reasons.length > 0 && !("openness" in value) && value.reasons.every(
      (reason) => typeof reason === "string" && INVALIDITY_REASONS.has(reason)
    );
  }
  return false;
}
function validateSample(value) {
  if (!isRecord(value)) {
    return { ok: false, reason: "invalid_eye_observation", message: "Il campione non \xE8 un oggetto." };
  }
  if (!isValidTimestamp(value.timestampMs)) {
    return {
      ok: false,
      reason: "invalid_timestamp",
      message: "timestampMs deve essere un numero finito e non negativo."
    };
  }
  if (!isValidCalibrationId(value.calibrationId)) {
    return {
      ok: false,
      reason: "invalid_calibration_id",
      message: "calibrationId deve essere una stringa non vuota."
    };
  }
  if (!isEyeObservation(value.left)) {
    return {
      ok: false,
      reason: "invalid_eye_observation",
      message: "Il campione dell\u2019occhio sinistro non rispetta il contratto."
    };
  }
  if (!isEyeObservation(value.right)) {
    return {
      ok: false,
      reason: "invalid_eye_observation",
      message: "Il campione dell\u2019occhio destro non rispetta il contratto."
    };
  }
  return { ok: true };
}
function nextEyeState(previous, openness, config) {
  if (previous === "closed") {
    return openness >= config.openExit ? "open" : "closed";
  }
  return openness <= config.closedEnter ? "closed" : "open";
}
function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}
function closureStats(events, kind, prolongedClosureMs) {
  const selected = events.filter((event) => event.kind === kind);
  let completeCount = 0;
  let prolongedCount = 0;
  let longestCompleteMs = null;
  let longestObservedMs = null;
  for (const event of selected) {
    if (longestObservedMs === null || event.durationMs > longestObservedMs) {
      longestObservedMs = event.durationMs;
    }
    if (event.complete) {
      completeCount += 1;
      if (longestCompleteMs === null || event.durationMs > longestCompleteMs) {
        longestCompleteMs = event.durationMs;
      }
      if (event.durationMs >= prolongedClosureMs) {
        prolongedCount += 1;
      }
    }
  }
  return Object.freeze({
    episodeCount: selected.length,
    completeCount,
    incompleteCount: selected.length - completeCount,
    prolongedCount,
    longestCompleteMs,
    longestObservedMs
  });
}
function windowClosureStats(events, kind, prolongedClosureMs) {
  const selected = events.filter((event) => event.kind === kind);
  let completeCount = 0;
  let prolongedCount = 0;
  let longestCompleteMs = null;
  let longestObservedMs = null;
  for (const event of selected) {
    if (longestObservedMs === null || event.windowOverlapMs > longestObservedMs) {
      longestObservedMs = event.windowOverlapMs;
    }
    if (event.completeWithinWindow) {
      completeCount += 1;
      if (longestCompleteMs === null || event.durationMs > longestCompleteMs) {
        longestCompleteMs = event.durationMs;
      }
      if (event.durationMs >= prolongedClosureMs) {
        prolongedCount += 1;
      }
    }
  }
  return Object.freeze({
    episodeCount: selected.length,
    completeCount,
    incompleteCount: selected.length - completeCount,
    prolongedCount,
    longestCompleteMs,
    longestObservedMs
  });
}
function emptyEyeScope(elapsedMs, kind, prolongedClosureMs, allEvents) {
  return Object.freeze({
    validMs: 0,
    closedMs: 0,
    openMs: 0,
    coverage: ratio(0, elapsedMs),
    closureFraction: null,
    closures: closureStats(allEvents, kind, prolongedClosureMs)
  });
}
var TemporalEngine = class {
  constructor(config = {}) {
    this.status = "idle";
    this.calibrationIds = [];
    this.activeCalibrationId = null;
    this.calibrationChanges = 0;
    this.acceptedSamples = 0;
    this.rejectedSamples = 0;
    this.rejections = [];
    this.firstTimestampMs = null;
    this.lastTimestampMs = null;
    this.lastSample = null;
    this.left = { state: "unknown", active: null };
    this.right = { state: "unknown", active: null };
    this.bilateralState = "unknown";
    this.bilateralActive = null;
    this.eyeEventCounters = { left: 0, right: 0 };
    this.bilateralEventCounter = 0;
    this.sessionEvents = [];
    this.intervals = [];
    this.sessionLeftValidMs = 0;
    this.sessionLeftClosedMs = 0;
    this.sessionRightValidMs = 0;
    this.sessionRightClosedMs = 0;
    this.sessionValidMs = 0;
    this.sessionClosedMs = 0;
    this.sessionGapMs = 0;
    this.sessionCalibrationTransitionMs = 0;
    this.config = resolveEngineConfig(config);
  }
  /** Avvia una nuova sessione e azzera ogni risultato precedente. */
  start() {
    this.resetInternal();
    this.status = "running";
  }
  /**
   * Elabora un campione.
   *
   * I campioni malformati o non monotoni vengono rifiutati e non modificano la
   * misura. Chiamare `processSample` senza `start`, o dopo `stop`, è un errore
   * d'uso e lancia `EngineStateError`.
   */
  processSample(sample) {
    if (this.status !== "running") {
      throw new EngineStateError(
        "Il motore non \xE8 in esecuzione: chiamare start() prima di processSample()."
      );
    }
    const raw = sample;
    const validation = validateSample(raw);
    if (!validation.ok) {
      const timestampMs2 = isRecord(raw) && isValidTimestamp(raw.timestampMs) ? raw.timestampMs : null;
      return this.reject(timestampMs2, validation.reason, validation.message);
    }
    const parsed = raw;
    const timestampMs = parsed.timestampMs;
    if (this.lastTimestampMs !== null) {
      if (timestampMs === this.lastTimestampMs) {
        return this.reject(
          timestampMs,
          "duplicate_timestamp",
          "Il timestamp coincide con il campione precedente."
        );
      }
      if (timestampMs < this.lastTimestampMs) {
        return this.reject(
          timestampMs,
          "out_of_order_timestamp",
          "Il timestamp \xE8 precedente al campione accettato precedente."
        );
      }
    }
    const intervalMs = this.lastTimestampMs === null ? 0 : timestampMs - this.lastTimestampMs;
    const calibrationChanged = this.activeCalibrationId !== null && parsed.calibrationId !== this.activeCalibrationId;
    if (this.lastTimestampMs === null) {
      this.firstTimestampMs = timestampMs;
      this.registerCalibration(parsed.calibrationId);
    } else {
      this.accountInterval(intervalMs, calibrationChanged);
      if (calibrationChanged) {
        this.endActiveEvents(this.lastTimestampMs, "calibration_changed");
        this.resetContinuity();
        this.calibrationChanges += 1;
        this.registerCalibration(parsed.calibrationId);
      } else if (intervalMs > this.config.maxGapMs) {
        this.endActiveEvents(this.lastTimestampMs, "gap");
        this.resetContinuity();
      }
    }
    this.acceptedSamples += 1;
    this.lastTimestampMs = timestampMs;
    this.lastSample = parsed;
    this.applyEyeObservation("left", parsed.left, timestampMs);
    this.applyEyeObservation("right", parsed.right, timestampMs);
    this.applyBilateral(parsed.left, parsed.right, timestampMs);
    return Object.freeze({
      status: "accepted",
      timestampMs,
      intervalMs,
      gap: !calibrationChanged && intervalMs > this.config.maxGapMs,
      calibrationChanged
    });
  }
  /**
   * Istantanea immutabile della sessione, della finestra mobile e dello stato
   * corrente. È sicuro chiamarla più volte: non modifica la misura.
   */
  getSnapshot() {
    const events = this.collectSessionEvents();
    const session = this.buildSessionSnapshot(events);
    const window = this.buildWindowSnapshot(events);
    return Object.freeze({
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      status: this.status,
      config: this.config,
      calibrationIds: Object.freeze([...this.calibrationIds]),
      diagnostics: Object.freeze({
        acceptedSamples: this.acceptedSamples,
        rejectedSamples: this.rejectedSamples,
        rejections: Object.freeze([...this.rejections]),
        calibrationChanges: this.calibrationChanges
      }),
      session,
      window,
      current: this.buildCurrent()
    });
  }
  /**
   * Arresta la sessione. Un episodio ancora aperto diventa incompleto con
   * motivo `stopped` e non viene prolungato fino all'istante della chiamata.
   */
  stop() {
    if (this.status !== "running") {
      return;
    }
    this.endActiveEvents(this.lastTimestampMs, "stopped");
    this.status = "stopped";
  }
  /** Riporta il motore in `idle` e cancella tutti i risultati. */
  reset() {
    this.resetInternal();
    this.status = "idle";
  }
  registerCalibration(calibrationId) {
    this.activeCalibrationId = calibrationId;
    if (!this.calibrationIds.includes(calibrationId)) {
      this.calibrationIds.push(calibrationId);
    }
  }
  reject(timestampMs, reason, message) {
    const rejection = Object.freeze({ timestampMs, reason, message });
    this.rejections.push(rejection);
    this.rejectedSamples += 1;
    return Object.freeze({ status: "rejected", timestampMs, reason, message });
  }
  accountInterval(intervalMs, calibrationChanged) {
    const previousTimestampMs = this.lastTimestampMs;
    const previousSample = this.lastSample;
    if (previousTimestampMs === null || previousSample === null) {
      return;
    }
    const leftValid = previousSample.left.validity === "valid";
    const rightValid = previousSample.right.validity === "valid";
    const bilateralValid = leftValid && rightValid;
    const excluded = calibrationChanged ? "calibration_change" : intervalMs > this.config.maxGapMs ? "gap" : null;
    this.intervals.push({
      startMs: previousTimestampMs,
      endMs: previousTimestampMs + intervalMs,
      excluded,
      leftValid,
      rightValid,
      leftState: this.left.state,
      rightState: this.right.state,
      bilateralState: this.bilateralState,
      bilateralValid
    });
    if (excluded === "calibration_change") {
      this.sessionCalibrationTransitionMs += intervalMs;
      return;
    }
    if (excluded === "gap") {
      this.sessionGapMs += intervalMs;
      return;
    }
    if (leftValid) {
      this.sessionLeftValidMs += intervalMs;
      if (this.left.state === "closed") {
        this.sessionLeftClosedMs += intervalMs;
      }
    }
    if (rightValid) {
      this.sessionRightValidMs += intervalMs;
      if (this.right.state === "closed") {
        this.sessionRightClosedMs += intervalMs;
      }
    }
    if (bilateralValid) {
      this.sessionValidMs += intervalMs;
      if (this.bilateralState === "closed") {
        this.sessionClosedMs += intervalMs;
      }
    }
  }
  applyEyeObservation(side, observation, atMs) {
    const runtime = this.eyeRuntime(side);
    if (observation.validity === "invalid") {
      if (runtime.active !== null) {
        this.finishEyeEvent(side, atMs, "tracking_lost");
      }
      runtime.state = "unknown";
      return;
    }
    const next = nextEyeState(runtime.state, observation.openness, this.config);
    if (runtime.state !== "closed" && next === "closed") {
      this.startEyeEvent(side, atMs);
    } else if (runtime.state === "closed" && next !== "closed") {
      this.finishEyeEvent(side, atMs, "reopened");
    }
    runtime.state = next;
  }
  applyBilateral(left, right, atMs) {
    let next;
    if (left.validity === "invalid" || right.validity === "invalid") {
      next = "unknown";
    } else if (this.left.state === "closed" && this.right.state === "closed") {
      next = "closed";
    } else if (this.left.state === "open" && this.right.state === "open") {
      next = "open";
    } else {
      next = "mixed";
    }
    if (this.bilateralState !== "closed" && next === "closed") {
      this.startBilateralEvent(atMs);
    } else if (this.bilateralState === "closed" && next !== "closed") {
      this.finishBilateralEvent(
        atMs,
        next === "unknown" ? "tracking_lost" : "reopened"
      );
    }
    this.bilateralState = next;
  }
  eyeRuntime(side) {
    return side === "left" ? this.left : this.right;
  }
  startEyeEvent(side, atMs) {
    const runtime = this.eyeRuntime(side);
    if (runtime.active !== null) {
      return;
    }
    this.eyeEventCounters[side] += 1;
    const event = {
      id: `${side}-${this.eyeEventCounters[side]}`,
      kind: side,
      startedAtMs: atMs,
      endedAtMs: null,
      endedReason: null,
      complete: false
    };
    runtime.active = event;
    this.sessionEvents.push(event);
  }
  finishEyeEvent(side, atMs, reason) {
    const runtime = this.eyeRuntime(side);
    this.finishEvent(runtime.active, atMs, reason);
    runtime.active = null;
  }
  startBilateralEvent(atMs) {
    if (this.bilateralActive !== null) {
      return;
    }
    this.bilateralEventCounter += 1;
    const event = {
      id: `bilateral-${this.bilateralEventCounter}`,
      kind: "bilateral",
      startedAtMs: atMs,
      endedAtMs: null,
      endedReason: null,
      complete: false
    };
    this.bilateralActive = event;
    this.sessionEvents.push(event);
  }
  finishBilateralEvent(atMs, reason) {
    this.finishEvent(this.bilateralActive, atMs, reason);
    this.bilateralActive = null;
  }
  finishEvent(event, atMs, reason) {
    if (event === null || event.endedAtMs !== null) {
      return;
    }
    event.endedAtMs = atMs;
    event.endedReason = reason;
    event.complete = reason === "reopened";
  }
  endActiveEvents(atMs, reason) {
    if (atMs === null) {
      return;
    }
    this.finishEyeEvent("left", atMs, reason);
    this.finishEyeEvent("right", atMs, reason);
    this.finishBilateralEvent(atMs, reason);
  }
  resetContinuity() {
    this.left = { state: "unknown", active: null };
    this.right = { state: "unknown", active: null };
    this.bilateralState = "unknown";
    this.bilateralActive = null;
  }
  resetInternal() {
    this.calibrationIds = [];
    this.activeCalibrationId = null;
    this.calibrationChanges = 0;
    this.acceptedSamples = 0;
    this.rejectedSamples = 0;
    this.rejections = [];
    this.firstTimestampMs = null;
    this.lastTimestampMs = null;
    this.lastSample = null;
    this.left = { state: "unknown", active: null };
    this.right = { state: "unknown", active: null };
    this.bilateralState = "unknown";
    this.bilateralActive = null;
    this.eyeEventCounters = { left: 0, right: 0 };
    this.bilateralEventCounter = 0;
    this.sessionEvents = [];
    this.intervals = [];
    this.sessionLeftValidMs = 0;
    this.sessionLeftClosedMs = 0;
    this.sessionRightValidMs = 0;
    this.sessionRightClosedMs = 0;
    this.sessionValidMs = 0;
    this.sessionClosedMs = 0;
    this.sessionGapMs = 0;
    this.sessionCalibrationTransitionMs = 0;
  }
  collectSessionEvents() {
    return Object.freeze(
      [...this.sessionEvents].sort(
        (left, right) => left.startedAtMs - right.startedAtMs || KIND_ORDER[left.kind] - KIND_ORDER[right.kind] || left.id.localeCompare(right.id)
      ).map((event) => this.toClosureEvent(event))
    );
  }
  toClosureEvent(event) {
    const endedAtMs = event.endedAtMs;
    const referenceEndMs = endedAtMs ?? this.lastTimestampMs ?? event.startedAtMs;
    const durationMs = Math.max(0, referenceEndMs - event.startedAtMs);
    const complete = event.complete && endedAtMs !== null;
    return Object.freeze({
      id: event.id,
      kind: event.kind,
      startedAtMs: event.startedAtMs,
      endedAtMs,
      durationMs,
      complete,
      endedReason: event.endedReason,
      prolonged: complete && durationMs >= this.config.prolongedClosureMs
    });
  }
  buildSessionSnapshot(events) {
    const startMs = this.firstTimestampMs;
    const endMs = this.lastTimestampMs;
    const elapsedMs = startMs !== null && endMs !== null ? Math.max(0, endMs - startMs) : 0;
    return Object.freeze({
      startMs,
      endMs,
      elapsedMs,
      validMs: this.sessionValidMs,
      closedMs: this.sessionClosedMs,
      openMs: this.sessionValidMs - this.sessionClosedMs,
      unknownMs: elapsedMs - this.sessionValidMs,
      coverage: ratio(this.sessionValidMs, elapsedMs),
      closureFraction: ratio(this.sessionClosedMs, this.sessionValidMs),
      gapMs: this.sessionGapMs,
      calibrationTransitionMs: this.sessionCalibrationTransitionMs,
      closures: closureStats(events, "bilateral", this.config.prolongedClosureMs),
      left: this.buildEyeScope(
        this.sessionLeftValidMs,
        this.sessionLeftClosedMs,
        elapsedMs,
        events,
        "left"
      ),
      right: this.buildEyeScope(
        this.sessionRightValidMs,
        this.sessionRightClosedMs,
        elapsedMs,
        events,
        "right"
      ),
      events
    });
  }
  buildEyeScope(validMs, closedMs, elapsedMs, events, side) {
    return Object.freeze({
      validMs,
      closedMs,
      openMs: validMs - closedMs,
      coverage: ratio(validMs, elapsedMs),
      closureFraction: ratio(closedMs, validMs),
      closures: closureStats(events, side, this.config.prolongedClosureMs)
    });
  }
  buildWindowSnapshot(events) {
    const startMs = this.firstTimestampMs;
    const endMs = this.lastTimestampMs;
    if (startMs === null || endMs === null) {
      const elapsedMs2 = 0;
      const emptyEvents = Object.freeze([]);
      return Object.freeze({
        startMs: null,
        endMs: null,
        elapsedMs: elapsedMs2,
        validMs: 0,
        closedMs: 0,
        openMs: 0,
        unknownMs: 0,
        coverage: null,
        closureFraction: null,
        gapMs: 0,
        calibrationTransitionMs: 0,
        closures: closureStats([], "bilateral", this.config.prolongedClosureMs),
        left: emptyEyeScope(elapsedMs2, "left", this.config.prolongedClosureMs, []),
        right: emptyEyeScope(elapsedMs2, "right", this.config.prolongedClosureMs, []),
        events: emptyEvents
      });
    }
    const windowStartMs = Math.max(startMs, endMs - this.config.rollingWindowMs);
    const windowEndMs = endMs;
    const elapsedMs = windowEndMs - windowStartMs;
    let validMs = 0;
    let closedMs = 0;
    let leftValidMs = 0;
    let leftClosedMs = 0;
    let rightValidMs = 0;
    let rightClosedMs = 0;
    let gapMs = 0;
    let calibrationTransitionMs = 0;
    for (const interval of this.intervals) {
      const overlapStartMs = Math.max(interval.startMs, windowStartMs);
      const overlapEndMs = Math.min(interval.endMs, windowEndMs);
      if (overlapEndMs <= overlapStartMs) {
        continue;
      }
      const overlapMs = overlapEndMs - overlapStartMs;
      if (interval.excluded === "gap") {
        gapMs += overlapMs;
        continue;
      }
      if (interval.excluded === "calibration_change") {
        calibrationTransitionMs += overlapMs;
        continue;
      }
      if (interval.leftValid) {
        leftValidMs += overlapMs;
        if (interval.leftState === "closed") {
          leftClosedMs += overlapMs;
        }
      }
      if (interval.rightValid) {
        rightValidMs += overlapMs;
        if (interval.rightState === "closed") {
          rightClosedMs += overlapMs;
        }
      }
      if (interval.bilateralValid) {
        validMs += overlapMs;
        if (interval.bilateralState === "closed") {
          closedMs += overlapMs;
        }
      }
    }
    const windowEvents = this.collectWindowEvents(
      events,
      windowStartMs,
      windowEndMs
    );
    return Object.freeze({
      startMs: windowStartMs,
      endMs: windowEndMs,
      elapsedMs,
      validMs,
      closedMs,
      openMs: validMs - closedMs,
      unknownMs: elapsedMs - validMs,
      coverage: ratio(validMs, elapsedMs),
      closureFraction: ratio(closedMs, validMs),
      gapMs,
      calibrationTransitionMs,
      closures: windowClosureStats(
        windowEvents,
        "bilateral",
        this.config.prolongedClosureMs
      ),
      left: Object.freeze({
        validMs: leftValidMs,
        closedMs: leftClosedMs,
        openMs: leftValidMs - leftClosedMs,
        coverage: ratio(leftValidMs, elapsedMs),
        closureFraction: ratio(leftClosedMs, leftValidMs),
        closures: windowClosureStats(
          windowEvents,
          "left",
          this.config.prolongedClosureMs
        )
      }),
      right: Object.freeze({
        validMs: rightValidMs,
        closedMs: rightClosedMs,
        openMs: rightValidMs - rightClosedMs,
        coverage: ratio(rightValidMs, elapsedMs),
        closureFraction: ratio(rightClosedMs, rightValidMs),
        closures: windowClosureStats(
          windowEvents,
          "right",
          this.config.prolongedClosureMs
        )
      }),
      events: windowEvents
    });
  }
  collectWindowEvents(events, windowStartMs, windowEndMs) {
    const windowEvents = [];
    for (const event of events) {
      const eventEndMs = event.endedAtMs ?? windowEndMs;
      if (eventEndMs <= windowStartMs || event.startedAtMs >= windowEndMs) {
        continue;
      }
      const overlapStartMs = Math.max(event.startedAtMs, windowStartMs);
      const overlapEndMs = Math.min(eventEndMs, windowEndMs);
      const windowOverlapMs = overlapEndMs - overlapStartMs;
      if (windowOverlapMs <= 0) {
        continue;
      }
      const truncatedAtStart = event.startedAtMs < windowStartMs;
      const truncatedAtEnd = event.endedAtMs === null || event.endedAtMs > windowEndMs;
      const completeWithinWindow = event.complete && !truncatedAtStart && !truncatedAtEnd;
      windowEvents.push(
        Object.freeze({
          ...event,
          windowOverlapMs,
          completeWithinWindow,
          truncatedAtStart,
          truncatedAtEnd
        })
      );
    }
    return Object.freeze(windowEvents);
  }
  buildCurrent() {
    const sample = this.lastSample;
    const active = Object.freeze({
      left: this.left.active === null ? null : this.toClosureEvent(this.left.active),
      right: this.right.active === null ? null : this.toClosureEvent(this.right.active),
      bilateral: this.bilateralActive === null ? null : this.toClosureEvent(this.bilateralActive)
    });
    return Object.freeze({
      timestampMs: this.lastTimestampMs,
      calibrationId: this.activeCalibrationId,
      left: this.buildEyeReading("left", sample),
      right: this.buildEyeReading("right", sample),
      bilateral: this.bilateralState,
      active
    });
  }
  buildEyeReading(side, sample) {
    const observation = sample === null ? null : side === "left" ? sample.left : sample.right;
    if (observation?.validity === "valid") {
      return Object.freeze({
        state: this.eyeRuntime(side).state,
        openness: observation.openness,
        valid: true
      });
    }
    return Object.freeze({
      state: this.eyeRuntime(side).state,
      openness: null,
      valid: false
    });
  }
};

// server/agent/vision/vendor/analysis/calibration.ts
var DEFAULT_CALIBRATION_CONFIG = Object.freeze({
  requiredSamplesPerEye: 8,
  maxReferenceDeviation: 0.05,
  minimumSeparation: 0.05
});
var CalibrationConfigError = class extends Error {
  constructor(issues) {
    super(`Configurazione di calibrazione non valida: ${issues.join("; ")}`);
    this.name = "CalibrationConfigError";
    this.issues = Object.freeze([...issues]);
  }
};
function resolveCalibrationConfig(input = {}) {
  const values = {
    requiredSamplesPerEye: input.requiredSamplesPerEye ?? DEFAULT_CALIBRATION_CONFIG.requiredSamplesPerEye,
    maxReferenceDeviation: input.maxReferenceDeviation ?? DEFAULT_CALIBRATION_CONFIG.maxReferenceDeviation,
    minimumSeparation: input.minimumSeparation ?? DEFAULT_CALIBRATION_CONFIG.minimumSeparation
  };
  const issues = [];
  if (!Number.isInteger(values.requiredSamplesPerEye) || values.requiredSamplesPerEye < 2) {
    issues.push("requiredSamplesPerEye deve essere un intero almeno 2");
  }
  if (!Number.isFinite(values.maxReferenceDeviation) || values.maxReferenceDeviation < 0) {
    issues.push("maxReferenceDeviation deve essere finito e non negativo");
  }
  if (!Number.isFinite(values.minimumSeparation) || values.minimumSeparation <= 0) {
    issues.push("minimumSeparation deve essere finito e maggiore di 0");
  }
  if (issues.length > 0) {
    throw new CalibrationConfigError(issues);
  }
  const configId = [
    "n03-calibration-v1",
    `requiredSamplesPerEye=${values.requiredSamplesPerEye}`,
    `maxReferenceDeviation=${values.maxReferenceDeviation}`,
    `minimumSeparation=${values.minimumSeparation}`
  ].join("|");
  return Object.freeze({ ...values, configId });
}

// server/agent/vision/vendor/contracts/version.ts
var CONTRACT_VERSION = "c01-v2";

// server/agent/vision/vendor/validation/types.ts
var ValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
  }
};

// server/agent/vision/vendor/validation/performance.ts
function percentile(sorted, fraction) {
  if (sorted.length === 0) {
    return null;
  }
  if (sorted.length === 1) {
    return sorted[0] ?? null;
  }
  const rank = Math.max(0, Math.min(1, fraction)) * (sorted.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const lower = sorted[lowerIndex];
  const upper = sorted[upperIndex];
  if (lower === void 0 || upper === void 0) {
    return null;
  }
  if (lowerIndex === upperIndex) {
    return lower;
  }
  const weight = rank - lowerIndex;
  return lower * (1 - weight) + upper * weight;
}
function summarizeInferencePerformance(samples) {
  if (samples.length === 0) {
    return Object.freeze({
      count: 0,
      intervalMs: 0,
      framesPerSecond: null,
      meanInferenceMs: null,
      minInferenceMs: null,
      maxInferenceMs: null,
      p50InferenceMs: null,
      p95InferenceMs: null
    });
  }
  let firstTimestampMs = null;
  let lastTimestampMs = null;
  let previousTimestampMs = -Infinity;
  let totalMs = 0;
  const latencies = [];
  for (const sample of samples) {
    if (!Number.isFinite(sample.timestampMs) || sample.timestampMs < 0 || !Number.isFinite(sample.inferenceMs) || sample.inferenceMs < 0) {
      throw new ValidationError(
        "I campioni di prestazione devono avere timestamp e latenze finiti e non negativi."
      );
    }
    if (sample.timestampMs < previousTimestampMs) {
      throw new ValidationError(
        "I timestamp dei campioni di prestazione devono essere non decrescenti."
      );
    }
    firstTimestampMs ??= sample.timestampMs;
    lastTimestampMs = sample.timestampMs;
    previousTimestampMs = sample.timestampMs;
    totalMs += sample.inferenceMs;
    latencies.push(sample.inferenceMs);
  }
  const intervalMs = firstTimestampMs === null || lastTimestampMs === null ? 0 : Math.max(0, lastTimestampMs - firstTimestampMs);
  const sorted = [...latencies].sort((left, right) => left - right);
  const count = samples.length;
  return Object.freeze({
    count,
    intervalMs,
    framesPerSecond: count > 1 && intervalMs > 0 ? (count - 1) * 1e3 / intervalMs : null,
    meanInferenceMs: totalMs / count,
    minInferenceMs: sorted[0] ?? null,
    maxInferenceMs: sorted[sorted.length - 1] ?? null,
    p50InferenceMs: percentile(sorted, 0.5),
    p95InferenceMs: percentile(sorted, 0.95)
  });
}

// server/agent/vision/vendor/contracts/limits.ts
var MAX_SESSION_SAMPLES = 18e3;
var MAX_CHART_POINTS = 2e3;
var MAX_PERFORMANCE_SAMPLES = MAX_SESSION_SAMPLES + 1;

// server/agent/vision/vendor/integration/parse-session-export.ts
var MAX_JSON_LENGTH = 5e7;
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}
function text(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function fail(message) {
  throw new Error(`JSON sessione non valido: ${message}`);
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function parseSessionExport(json) {
  if (json.length > MAX_JSON_LENGTH) fail("dimensione superiore al limite di 50 milioni di caratteri.");
  let raw;
  try {
    raw = JSON.parse(json);
  } catch {
    return fail("sintassi JSON.");
  }
  if (!record(raw) || raw.schemaVersion !== "crewready-session-v2" || raw.contractVersion !== CONTRACT_VERSION) fail("versione dello schema o del contratto non supportata.");
  if (!text(raw.exportedAt) || !Number.isFinite(Date.parse(raw.exportedAt))) fail("data di esportazione.");
  if (!record(raw.units) || raw.units.time !== "ms" || raw.units.openness !== "normalized" || raw.units.fractions !== "0-1") fail("unit\xE0.");
  if (!record(raw.source) || raw.source.kind !== "webcam" && raw.source.kind !== "synthetic") fail("origine.");
  if (!record(raw.snapshot) || !record(raw.snapshot.config) || !record(raw.calibration) || !Array.isArray(raw.samples) || !Array.isArray(raw.performanceSamples)) fail("istantanea, calibrazione o campioni.");
  if (raw.samples.length > MAX_SESSION_SAMPLES || raw.performanceSamples.length > MAX_PERFORMANCE_SAMPLES) fail("limite di campioni superato.");
  const knownReasons = new Set(EYE_INVALIDITY_REASONS);
  const validEye = (value) => record(value) && (value.validity === "valid" ? finite(value.openness) : value.validity === "invalid" && !("openness" in value) && Array.isArray(value.reasons) && value.reasons.length > 0 && value.reasons.every((reason) => typeof reason === "string" && knownReasons.has(reason)));
  for (const sample of raw.samples) {
    if (!record(sample) || !finite(sample.timestampMs) || typeof sample.calibrationId !== "string" || !validEye(sample.left) || !validEye(sample.right)) fail("formato di un campione.");
  }
  const data = raw;
  try {
    const engine = new TemporalEngine(data.snapshot.config);
    if (data.snapshot.status !== "idle") engine.start();
    else if (data.samples.length) fail("campioni in una sessione inattiva.");
    for (const sample of data.samples) engine.processSample(sample);
    if (data.snapshot.status === "stopped") engine.stop();
    if (canonical(engine.getSnapshot()) !== canonical(data.snapshot)) fail("istantanea non coerente con configurazione e campioni.");
    summarizeInferencePerformance(data.performanceSamples);
  } catch (error) {
    return fail(error instanceof Error ? error.message : "campioni o configurazione.");
  }
  if (!record(raw.unavailable) || raw.unavailable.coverage !== (data.snapshot.session.coverage === null ? "no_elapsed_time" : null) || raw.unavailable.closureFraction !== (data.snapshot.session.closureFraction === null ? "no_valid_time" : null) || raw.unavailable.longestCompleteMs !== (data.snapshot.session.closures.longestCompleteMs === null ? "no_complete_events" : null)) fail("motivi di indisponibilit\xE0.");
  if (data.source.kind === "synthetic") {
    if (!text(data.source.fixtureName) || !text(data.source.fixtureVersion) || !/^fnv1a32-[0-9a-f]{8}$/.test(data.source.fixtureFingerprint) || data.clock !== "fixture-time" || data.timeOriginUnixMs !== null || data.inference !== null || data.application !== null || data.performanceSamples.length || data.calibration.kind !== "synthetic-normalized" || canonical(data.calibration.calibrationIds) !== canonical(data.snapshot.calibrationIds) || !text(data.calibration.reason)) fail("metadati sintetici.");
  } else {
    if (data.clock !== "performance-time-origin" || !finite(data.timeOriginUnixMs) || data.timeOriginUnixMs < 0 || !record(raw.inference) || !record(raw.application) || !record(raw.calibration) || data.calibration.kind !== "profiles" || !Array.isArray(data.calibration.profiles) || !record(data.calibration.configurations)) fail("metadati webcam.");
    const source = data.source;
    if (!data.calibration.profiles.length) fail("profilo webcam mancante.");
    if (!record(source.limits) || !Number.isInteger(source.limits.maxSamples) || source.limits.maxSamples < 1 || source.limits.maxSamples > MAX_SESSION_SAMPLES || !Number.isInteger(source.limits.maxChartPoints) || source.limits.maxChartPoints < 2 || source.limits.maxChartPoints > MAX_CHART_POINTS || typeof source.limits.chartReduced !== "boolean" || data.samples.length > source.limits.maxSamples) fail("limiti di sessione.");
    if (source.device !== null && (!record(source.device) || source.device.id !== null && typeof source.device.id !== "string" || source.device.label !== null && typeof source.device.label !== "string")) fail("dispositivo webcam.");
    if (source.imageDimensions !== null && (!record(source.imageDimensions) || !Number.isInteger(source.imageDimensions.width) || !Number.isInteger(source.imageDimensions.height) || source.imageDimensions.width <= 0 || source.imageDimensions.height <= 0)) fail("dimensioni immagine.");
    const phases = ["idle", "loading", "preview", "calibrating", "measuring", "stopped", "suspended", "error"];
    const interruptions = ["user_stop", "source_changed", "page_hidden", "device_lost", "calibration_invalidated", "sample_limit", "processing_error"];
    if (!data.application || !phases.includes(data.application.phase) || data.application.interruption !== null && !interruptions.includes(data.application.interruption) || data.application.error !== null && (!record(data.application.error) || !["capture", "runtime", "inference", "calibration", "analysis"].includes(data.application.error.stage) || !text(data.application.error.message)) || data.application.phase === "error" !== (data.application.error !== null)) fail("stato applicativo.");
    const ids = /* @__PURE__ */ new Set();
    for (const profile of data.calibration.profiles) {
      if (!record(profile) || !text(profile.id) || ids.has(profile.id) || !text(profile.version) || !text(profile.methodVersion) || !finite(profile.capturedAtMs) || profile.capturedAtMs < 0 || profile.normalization !== "open-closed-v1" || !record(profile.eyes)) fail("profilo di calibrazione.");
      ids.add(profile.id);
      for (const side of ["left", "right"]) {
        const eye = profile.eyes[side];
        if (!record(eye) || !finite(eye.open) || !finite(eye.closed) || !finite(eye.minimumSeparation) || eye.closed < 0 || eye.minimumSeparation <= 0 || eye.open - eye.closed < eye.minimumSeparation) fail("riferimenti di calibrazione.");
      }
      const config = data.calibration.configurations[profile.id];
      if (!record(config)) fail("configurazione di calibrazione mancante.");
      try {
        if (canonical(resolveCalibrationConfig(config)) !== canonical(config)) fail("configurazione di calibrazione incoerente.");
      } catch {
        return fail("configurazione di calibrazione non valida.");
      }
    }
    if (data.snapshot.calibrationIds.some((id) => !ids.has(id))) fail("profilo di calibrazione mancante.");
    const inference = data.inference;
    if (!inference || !record(inference.config) || !record(inference.provenance)) fail("provenienza inferenza.");
    const provenanceKeys = ["adapterVersion", "runtime", "runtimeVersion", "runtimeLicense", "runtimeSource", "model", "modelVersion", "modelId", "modelSha256", "modelLicense", "modelSource", "geometryMethodVersion", "configId"];
    if (provenanceKeys.some((key) => !text(inference.provenance[key])) || !/^[0-9a-f]{64}$/i.test(inference.provenance.modelSha256) || !Number.isInteger(inference.provenance.modelSizeBytes) || inference.provenance.modelSizeBytes <= 0 || !text(inference.config.modelAssetPath) || !text(inference.config.wasmAssetPath) || !text(inference.config.configId) || !record(inference.config.geometry) || !text(inference.config.geometry.configId) || !["CPU", "GPU"].includes(inference.config.delegate) || inference.provenance.configId !== inference.config.configId || inference.provenance.delegate !== inference.config.delegate || inference.provenance.numFaces !== inference.config.numFaces || !Number.isInteger(inference.config.numFaces) || inference.config.numFaces < 1 || inference.config.numFaces > 4 || ![inference.config.minFaceDetectionConfidence, inference.config.minFacePresenceConfidence, inference.config.minTrackingConfidence].every((value) => finite(value) && value >= 0 && value <= 1) || !finite(inference.config.geometry.minEyeWidthPx) || inference.config.geometry.minEyeWidthPx <= 0 || !finite(inference.config.geometry.maxEyeAspectRatio) || inference.config.geometry.maxEyeAspectRatio <= 0 || !finite(inference.config.geometry.coordinateTolerancePx) || inference.config.geometry.coordinateTolerancePx < 0) fail("configurazione inferenza.");
  }
  return data;
}

// server/agent/vision/worker-entry.ts
if (!import_node_worker_threads.parentPort) throw new Error("Worker requires a parent port");
import_node_worker_threads.parentPort.once("message", (text2) => {
  try {
    import_node_worker_threads.parentPort.postMessage({ ok: true, data: parseSessionExport(text2) });
  } catch {
    import_node_worker_threads.parentPort.postMessage({ ok: false });
  }
});
