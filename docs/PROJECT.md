# AEGIS — Project Document

**Astronaut Evaluation & Guidance Intelligence System**

*Protecting the mind behind the mission.*

[Project overview](../README.md) · [Scientific foundation](SCIENTIFIC_FOUNDATION.md)

**Team:** 3DC · **Direction:** approved by the team · **Updated:** 14 November 2026

**Context:** NASA Space Apps Challenge 2026, health monitoring for astronauts.

## 1. Product purpose

**AEGIS is a health-monitoring system for astronauts that integrates an AI companion to offer companionship and support psychological well-being through context-aware conversation and voluntary activities.**

Health monitoring provides the foundation: understandable information about sleep, fatigue, vigilant attention and self-reported well-being. The companion makes that information part of an approachable daily experience. An astronaut should be able to return for company and also inspect their parameters.

The initial scope is behavioral health and cognitive self-monitoring. Physiological monitoring may be extended when suitable sensors, protocols and validation are available. AEGIS does not currently measure comprehensive physical or mental health.

**Product question:** Can astronauts use a locally available companion to understand their monitored state, choose relevant activities and feel supported while retaining control over data and interaction?

## 2. Scientific rationale

NASA identifies a need for more autonomous behavioral-health support during exploration missions [N1]. ISS research has combined sleep reports, subjective ratings and brief vigilance testing [R1]. NASA-supported research has also examined self-guided behavioral-health software through the Virtual Space Station [N2], while astronaut-journal research motivates opportunities for reflection [N3].

The original HI-SEAS evaluation of the Virtual Space Station found highly individual preferences for its content [R2]. Our design inference is to offer choice, relevant suggestions and easy refusal. This is not evidence that AEGIS or its LLM will improve well-being.

Throughout the experience, distinguish:

1. **Measured or reported facts**, with source, time and quality.
2. **Exploratory interpretation**, including uncertainty.
3. **An optional next step**, chosen by the astronaut.

A feature-by-feature evidence assessment and full references are maintained in [SCIENTIFIC_FOUNDATION.md](SCIENTIFIC_FOUNDATION.md).

## 3. The intended experience

### A calm home screen

The default view contains the companion, a compact summary of available sleep and well-being information, and a few actions: talk, check in, choose an activity or open the dashboard. The dashboard is readily accessible without occupying the screen continuously.

This is a design hypothesis about comfort and usability, to be compared with a dashboard-first alternative. We do not claim that dashboards themselves cause psychological harm.

### Voice and text

The astronaut can speak or type. Voice output should be brief, interruptible and accompanied by text. Initial voice interaction should be explicitly activated; continuous listening is not an assumed requirement. Quiet mode suppresses unsolicited interaction during work, rest or any user-selected period.

### Contextual companionship

The assistant asks how the person feels before treating a signal as a reason for an activity. The astronaut can correct a report, explain context, choose differently or decline. Conversation can also begin without a new measurement.

Personalization uses explicitly permitted preferences and context. Longer-term conversational memory, if introduced, needs review, deletion and retention controls. The companion complements human contact and professional support and must not discourage either.

### A dashboard that explains

The detailed view shows sleep reports, subjective ratings, vigilance results and available observational signals, together with timestamps, missing data and reliability. It distinguishes observations from interpretations and makes the reason for a suggestion inspectable. An overall health score is outside the initial scope.

## 4. Monitoring scope and component status

| Component | Intended contribution | Current status and limits |
|---|---|---|
| Sleep and well-being check-in | Sleep duration/quality, fatigue, alertness, mood or stress using defined questions | Planned integration; self-report, not objective sleep staging or diagnosis |
| PVT-style task | Brief measurement of vigilant attention and personal trends | Planned; protocol, timing quality and baseline rules still to specify |
| Eye-closure vision | Observable eye-open/closed events during an explicit camera session | Working standalone prototype reported by the team; code, accuracy and integration unverified here |
| Body landmarks | Locate body regions/landmarks for a future defined use | Working standalone prototype reported by the team; no health interpretation established |
| Companion | Conversation, explanation, reflection and activity proposals | Planned integration; benefit and reliability require evaluation |
| Dashboard and local history | Accessible review of parameters and provenance | Planned |

NASA-supported work on slow eyelid closure provides a relevant research precedent, with important limitations [N5]. Eye closure alone cannot establish sleep quality, an emotional state or the absence of fatigue. Body tracking also has spaceflight-relevant research applications, but a defined task and separate validation are necessary before interpreting it as a health measure [R3].

For vigilance comparisons, multiple suitable baseline sessions and explicit missing-data rules are required. Any example threshold, including a 20% change, is illustrative rather than a medical or operational cutoff. Subjective/objective disagreement is one useful observation, not the sole identity of AEGIS.

## 5. From context to voluntary activities

Suggestions combine available monitoring context, the astronaut's account, preferences and the activity/rest period. A curated catalog defines each activity's purpose, duration, relevant context, exclusions and source or review status. The AI adapts presentation and dialogue within those boundaries.

| Context | Conversation and possible choice | Limit |
|---|---|---|
| Shorter or poorer sleep reported | Ask how the person feels; offer reflection or a reviewed wind-down activity when appropriate to the schedule | No claim to treat insomnia or guarantee better sleep |
| User feels energetic and wants engagement | Offer a logic, memory or creative challenge with selectable difficulty | Challenge completion does not certify readiness |
| User reports stress or loneliness | Offer a listening-oriented exchange, an optional journal prompt or access to existing human-support resources | No psychological diagnosis or treatment |
| Vigilance differs from personal history | Explain quality limits; offer trend review or a later recheck under the chosen protocol | One result does not prove impairment or authorize duty changes |
| Data are insufficient or unreliable | Explain what is missing; allow an activity without pretending it is measurement-driven | No signal does not mean good health |

The initial catalog should include a reflective prompt, a calm activity and a stimulating challenge. Sleep-oriented educational content must be traceable to appropriate sources and reviewed before use as health guidance [N4]. Prescriptions, medication advice and autonomous changes to operational sleep/exercise plans are outside the prototype.

Challenge scores remain separate from standardized vigilance testing. No disguised games or undisclosed analysis of ordinary conversation as diagnostic tests.

## 6. First end-to-end demonstration

**Scenario: a check-in after a short night.**

1. The astronaut opens the companion and chooses enabled inputs after reviewing the collection disclosure.
2. They report sleep duration, sleep quality and current state.
3. A documented PVT-style session provides an attention measurement. Historical sample data are prominently labeled synthetic.
4. AEGIS shows a compact factual summary with uncertainty and access to the detailed dashboard.
5. Through voice or text, the companion asks how the astronaut feels and explains the relevant context.
6. The astronaut chooses a reviewed reflective or calm activity, selects a challenge instead, or declines.
7. Optional feedback records whether the interaction was welcome and useful. This is not a clinical outcome.
8. The astronaut can review their data. If export is included, it requires an explicit preview and approval.

The demo distinguishes live measurements, self-reports, synthetic history and simulated responses. Camera components can be demonstrated separately until integration and quality checks are ready.

## 7. MVP priorities

### Required for the first integrated experience

- [ ] Check-in with defined units and anchored questions.
- [ ] Documented PVT-style task, quality checks and transparent baseline comparison.
- [ ] Companion conversation using the actual structured context.
- [ ] Activity proposal, selection, decline and feedback flow.
- [ ] Compact home summary and detailed dashboard.
- [ ] Text interaction and interruptible voice input/output; clearly declare any missing voice capability in the demo.
- [ ] Local persistence, input controls and a documented retention policy.
- [ ] Demonstrated offline core; verify conversational and voice capabilities separately.
- [ ] AI-failure fallback preserving check-ins, measurements, dashboard and static activities.

### Next integrations

- [ ] Import and review standalone vision prototypes, dependencies, licenses and measured performance.
- [ ] Opt-in eye-closure sessions with signal-quality and camera-availability states.
- [ ] Define a concrete body-landmark use case before assigning it a health meaning.
- [ ] Expand reviewed activities and user-controlled preferences.
- [ ] Reviewable summary export and configurable journal retention.

## 8. Evaluation

| Question | First evaluation |
|---|---|
| Are measurements and comparisons correct? | Hand-checked fixtures, invalid/missing-data cases and reproducible calculations |
| Is reaction-time measurement stable? | Timing and input-latency checks on demo hardware, with limitations disclosed |
| Does the companion preserve facts? | Compare responses with supplied values; test uncertainty, unavailable sensors and conflicting self-reports |
| Are suggestions appropriate and optional? | Review catalog rules; test acceptance, alternatives, decline and quiet mode |
| Is interaction understandable and comfortable? | Usability sessions comparing conversational and dashboard-first entry points |
| Does voice work in the intended setting? | Recognition failures, response delay, interruption and text fallback |
| Does the experience survive failures? | Disconnect network and disable individual AI, voice and camera services |
| Is sharing controlled? | Demonstrate preview, export confirmation and private-note separation |

Initial user feedback establishes feasibility and perceived usefulness. Improved sleep, reduced loneliness or better psychological health require a separately designed study, appropriate measures and specialist involvement. A hackathon demonstration does not establish those outcomes.

## 9. Requirements for the next architecture phase

Model selection and implementation details remain open. The approved requirements are:

- Calculations, quality checks and trend interpretation remain reproducible outside the LLM.
- The companion receives limited, permissioned context and uses a reviewed activity catalog.
- Voice, language generation and vision are separable capabilities with explicit failure states.
- Local execution is the target; hardware feasibility, latency and resource use must be measured.
- Conversations and optional journals are separated from shared monitoring metrics.
- The user controls camera, microphone, interaction, retention and export.
- Professional and mission procedures retain authority over medical and operational decisions.

These guide the next discussion of models, contracts, orchestration and deployment; they do not select a stack prematurely.

## 10. Key references

- **[N1] NASA — [Behavioral Health capability](https://www.nasa.gov/directorates/esdmd/hhp/behavioral-health/).**
- **[R1] Jones et al. (2022), Sleep — [ISS sleep and neurobehavioral performance](https://doi.org/10.1093/sleep/zsac006).**
- **[N2] NASA HRR — [Autonomous Behavioral Health Countermeasures: Virtual Space Station](https://humanresearchroadmap.nasa.gov/Tasks/task.aspx?i=1176).**
- **[N3] Stuster (2010), NASA — [Review and Analysis of Astronaut Journals](https://ntrs.nasa.gov/citations/20100026549).**
- **[R2] Anderson et al. (2016) — [Virtual Space Station at HI-SEAS](https://doi.org/10.3357/AMHP.4676.2016).**
- **[N4] NASA — [Seven Ways Astronauts Improve Sleep](https://www.nasa.gov/missions/station/seven-ways-astronauts-improve-sleep-may-help-you-snooze-better-on-earth/).**
- **[N5] NASA/NSBRI Task Book — [Optical Computer Recognition of Stress, Affect and Fatigue](https://taskbook.nasaprs.com/tbp/tbpdf.cfm?id=9095).**
- **[R3] Weiss et al. (2025), NASA-hosted manuscript — [Unobtrusive Monitoring of Sensorimotor Performance](https://ntrs.nasa.gov/citations/20240012833).**

Challenge: [Create Health Monitoring Software for Astronauts on Space Missions](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/). The challenge page could not be retrieved during this review; its detailed requirements have not been reverified.

## 11. Team and project status

**3DC:** Matteo D'Onofrio, Fabrizio D'Errico, Emanuel Chirico and Aniello De Girolamo Del Mauro.

This repository contains documentation and visual assets. Standalone vision functionality is reported by the team; no integrated application has been verified here. Features above are targets unless stated otherwise. AEGIS is an independent research/hackathon project, with no NASA endorsement, clinical validation or flight certification.
