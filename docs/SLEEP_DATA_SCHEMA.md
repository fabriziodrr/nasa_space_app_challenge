# Sleep data: initial contract

AEGIS stores referenced and instrumental data with distinct origins. The fields are a proposal for interoperability for the prototype; they do not imply the presence of an identical device or NASA protocol.

| Field | Meaning | Source |
|---|---|---|
| `period_start`, `period_end` | Observed interval, with time zone | Instrument |
| `sleep_hours` | Estimated sleep hours, from 0 to 24 | Instrument |
| `sleep_latency_minutes` | Minutes before falling asleep | Optional, instrument estimate |
| `wake_after_sleep_onset_minutes` | Minutes awake after sleep onset | Optional, instrument estimate |
| `awakenings_count` | Number of awakenings | Optional, instrument estimate |
| `sleep_efficiency_percent` | Device-reported efficiency, 0–100% | Optional; manufacturer definition to be verified |
| `sleep_stages.rem_minutes` | Estimated REM duration in minutes | Optional, declared EEG sensor or EEG simulation |
| `heart_rate_variability.value_ms` | Heart rate variability in milliseconds | Optional; device, method, and aggregation explicit |
| `sleep_quality` | Person's 1–10 rating | Separate `sleep` check-in, with `scale_max` |
| `fatigue_rating`, `alertness` | Person-reported 1–10 state | Separate confirmed feedback |

Each instrumental detection requires device, method, timestamp, declared quality, and synthetic flag. Missing optional fields remain `null`: they are not inferred from total time. REM or HRV are not calculated without appropriate devices and protocols.

The [NASA actigraphy research](https://ntrs.nasa.gov/citations/20220014774) considers duration, wake after sleep onset, and efficiency; [NASA also describes perceived quality questionnaires](https://www.nasa.gov/humans-in-space/spaceflight-standard-measures-characterizing-how-humans-adapt-in-space/). These precedents motivate the fields, but do not validate AEGIS instruments or algorithms. Existing synthetic historical data remain compatible with the new optional fields.

NASA describes the ESA [Dreams](https://www.nasa.gov/humans-in-space/science-in-space-week-of-sept-15-2023-sleep-on-station/) experiment, with EEG headband and sleep stage information; a [SpaceWear demonstration](https://www.nasa.gov/blogs/stationreport/2023/09/19/iss-daily-summary-report-9-19-2023/) also collected heart rate variability. These are study examples, not proof that every spacecraft has permanent sensors or that AEGIS is connected to them. The RMSSD method and aggregation in the sample are fictional choices, not official NASA values.

The file [nasa_sensor_demo.json](../server/examples/nasa_sensor_demo.json) contains a fully synthetic night: REM, HRV, and other values are invented to show the flow. In **Crew Data → Sleep recovery**, use **Load sensor demo** and **Refresh**. If the sample already exists, it is not overwritten. The data agent forwards the measures in its report; it does not attribute clinical thresholds nor alter a diagnosis or fatigue score.

With `AGENT_SENSOR_PROVIDER=python`, even the conversational agent can receive latency, wake time, efficiency, REM, and HRV when present in the valid snapshot: REM and HRV retain their own device and method and HRV also retains aggregation. Absent fields do not produce measures. Recent synthetic readings associated with the fictional profile from the server can be considered in the demo proposal; unverified associations remain excluded.

## Intermediate context

`get_integrated_context` combines the personal synthetic snapshot with the **selected** vision measure. The response keeps origins and quality separate, states that common identity is still to be verified, and does not calculate fatigue diagnosis. If vision does not respond, the status is `unavailable` and sleep remains readable.

For model-free testing, `POST /v1/demo/integrated-context` is available, with the same token and same `vision_session_id` described in [LANGCHAIN.md](LANGCHAIN.md). It does not record or automatically transmit the vision measure to Earth.

On the `/voice-demo` page, after importing and selecting a measure, the **Verify sleep and vision context** button invokes the context via the local proxy. The Python backend must be started on port 8000, with `AGENT_DEMO_TOKEN` identical to that of the Next server. The summary shows origin and availability, not a medical conclusion.
