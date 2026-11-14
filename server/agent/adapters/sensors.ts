// Simulated sensor provider. Reads are deterministic and reproducible for a given
// scenario; no persistence is required because the readings are pure functions.
import type { Scenario, SensorReading, SensorWindow } from "../contracts";
import type { SensorProvider } from "../ports";
import { sensorReadings } from "../simulator/scenarios";

export class SimulatedSensorProvider implements SensorProvider {
  constructor(private readonly scenario: Scenario) {}

  async read(astronautId: string, window: SensorWindow): Promise<SensorReading[]> {
    const from = Date.parse(window.from);
    const to = Date.parse(window.to);
    return sensorReadings(this.scenario, astronautId).filter((reading) => {
      const observedAt = Date.parse(reading.observedAt);
      return observedAt >= from && observedAt <= to;
    });
  }
}
