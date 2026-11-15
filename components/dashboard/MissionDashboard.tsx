"use client";

import { useRef, useState } from "react";
import { ScheduleSnapshotSchema, type GroundReport, type ScheduleActivity, type ScheduleProposal, type ScheduleSnapshot } from "../../server/agent/contracts";
import { applyScheduleChanges } from "../../server/agent/lib/schedule";
import { decideProposal, getProposals, getReports, getSchedule, MissionApiError, saveSchedule } from "../../client/dashboard/mission-api";
import styles from "./MissionDashboard.module.css";
import { demoCrewMappings } from "../../server/agent/demo-crew";

type Decision = "APPROVE" | "REJECT";
type PendingDecision = { decision: Decision; key: string };
const storageKey = (id: string) => `mission-decision-${id}`;
const format = (value: string) => `${value.replace("T", " ").slice(0, 16)} UTC`;
const inputTime = (value: string) => value.slice(0, 16);
const utcTime = (value: string) => value ? `${value}:00Z` : "";
// Display the original demo activity names in English without rewriting saved schedules.
const demoTitles: Record<string, string> = { Colazione: "Breakfast", Pranzo: "Lunch", Cena: "Dinner",
  "Esercizio programmato": "Scheduled exercise", "Collegamento Terra": "Ground contact",
  "Inventario campioni": "Sample inventory", "Revisione dati": "Data review",
  "Opportunità di sonno protetta": "Protected sleep opportunity" };
const activityTitle = (title: string) => demoTitles[title] ?? title;
function message(error: unknown) {
  if (error instanceof MissionApiError) {
    if (error.detail?.startsWith("Shared resource conflict:")) return error.detail;
    if (error.status === 401) return "Token not recognized.";
    if (error.status === 403) return "Decision not authorized. Use the AGENT_GROUND_TOKEN configured on the server, reload the data and try again.";
    if (error.status === 404) return "Resource unavailable for this astronaut.";
    if (error.status === 409) return "The schedule or proposal has changed. Reload the data before continuing.";
    if (error.status === 400) return "Invalid data: check times, allowed windows and overlaps.";
  }
  return "Service unavailable or invalid response. Please try again.";
}

export function MissionDashboard({ perspective, onBack }: { perspective: "houston" | "iss"; onBack(): void }) {
  const ground = perspective === "houston";
  const [token, setToken] = useState("");
  const [astronaut, setAstronaut] = useState("astro-1");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [schedule, setSchedule] = useState<ScheduleSnapshot | null>(null);
  const [draft, setDraft] = useState<ScheduleSnapshot | null>(null);
  const [reports, setReports] = useState<GroundReport[]>([]);
  const [proposals, setProposals] = useState<ScheduleProposal[]>([]);
  const [reportCursor, setReportCursor] = useState<string | null>(null);
  const [proposalCursor, setProposalCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const pending = useRef<Record<string, PendingDecision>>({});
  const dirty = loaded && !!draft && !!schedule && JSON.stringify(draft) !== JSON.stringify(schedule);
  const lockSelection = dirty && !conflict;

  function getPending(id: string): PendingDecision | null {
    if (pending.current[id]) return pending.current[id];
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(storageKey(id)) ?? "null");
      if (saved && typeof saved === "object" && "key" in saved && "decision" in saved
          && typeof saved.key === "string" && (saved.decision === "APPROVE" || saved.decision === "REJECT")) {
        return pending.current[id] = { key: saved.key, decision: saved.decision };
      }
    } catch { /* Session storage may be unavailable. */ }
    return null;
  }
  function remember(id: string, item: PendingDecision | null) {
    if (item) pending.current[id] = item; else delete pending.current[id];
    try { if (item) sessionStorage.setItem(storageKey(id), JSON.stringify(item)); else sessionStorage.removeItem(storageKey(id)); } catch { /* In-memory retry remains possible. */ }
  }
  async function load() {
    if (!token.trim() || !astronaut.trim() || !date) return;
    setBusy(true); setNotice("");
    try {
      const [day, reportPage, proposalPage] = await Promise.all([
        getSchedule(token, astronaut.trim(), date),
        ground ? getReports(token, astronaut.trim()) : Promise.resolve(null),
        ground ? getProposals(token, astronaut.trim()) : Promise.resolve(null),
      ]);
      setSchedule(day); setDraft(structuredClone(day)); setReports(reportPage?.items ?? []); setProposals(proposalPage?.items ?? []);
      setReportCursor(reportPage?.nextCursor ?? null); setProposalCursor(proposalPage?.nextCursor ?? null);
      setLoaded(true); setConflict(false);
    } catch (error) { setLoaded(false); setNotice(message(error)); }
    finally { setBusy(false); }
  }
  async function more(kind: "reports" | "proposals") {
    setBusy(true); setNotice("");
    try {
      if (kind === "reports" && reportCursor) {
        const page = await getReports(token, astronaut.trim(), reportCursor);
        setReports((old) => [...old, ...page.items.filter((item) => !old.some((x) => x.id === item.id))]); setReportCursor(page.nextCursor);
      } else if (kind === "proposals" && proposalCursor) {
        const page = await getProposals(token, astronaut.trim(), proposalCursor);
        setProposals((old) => [...old, ...page.items.filter((item) => !old.some((x) => x.id === item.id))]); setProposalCursor(page.nextCursor);
      }
    } catch (error) { setNotice(message(error)); } finally { setBusy(false); }
  }
  async function save() {
    if (!draft || !schedule || conflict) return;
    const valid = ScheduleSnapshotSchema.safeParse(draft);
    if (!valid.success) { setNotice("Check that all schedule fields and times are valid."); return; }
    setBusy(true); setNotice("");
    try {
      const updated = await saveSchedule(token, valid.data);
      setSchedule(updated); setDraft(structuredClone(updated)); setNotice(`Schedule updated to version ${updated.version}.`);
    } catch (error) {
      if (!(error instanceof MissionApiError) || error.status >= 500 || error.status === 409) setConflict(true);
      setNotice(error instanceof MissionApiError && error.status === 409 ? message(error)
        : !(error instanceof MissionApiError) || error.status >= 500 ? "Save outcome uncertain: reload the schedule before retrying." : message(error));
    } finally { setBusy(false); }
  }
  async function decide(proposal: ScheduleProposal, decision: Decision) {
    const previous = getPending(proposal.id);
    if (previous && previous.decision !== decision) { setNotice("A decision is still unconfirmed: repeat the same action."); return; }
    const operation = previous ?? { decision, key: crypto.randomUUID() };
    remember(proposal.id, operation); setBusy(true); setNotice("");
    try {
      const result = await decideProposal(token, proposal.id, operation.decision, operation.key);
      setProposals((old) => old.map((item) => item.id === proposal.id ? result.proposal : item));
      if (result.proposal.status === "APPLIED" && result.schedule) {
        if (result.schedule.date === date) { setSchedule(result.schedule); setDraft(structuredClone(result.schedule)); }
        remember(proposal.id, null); setNotice("Proposal approved and schedule updated.");
      } else if (result.proposal.status === "REJECTED") { remember(proposal.id, null); setNotice("Proposal rejected; the schedule is unchanged."); }
      else if (result.proposal.status === "APPLY_FAILED") { remember(proposal.id, null); setNotice("The proposal could not be applied. Check the schedule and shared resources, then request a new assessment."); }
      else setNotice("Decision recorded; the update is not yet confirmed. Repeat the same action to verify its outcome.");
    } catch (error) {
      if (error instanceof MissionApiError && error.status === 409 && error.code === "VERSION_CONFLICT") {
        remember(proposal.id, null); setConflict(true); setNotice("Outdated proposal: reload the schedule and request a new assessment.");
      } else {
        if (!previous && error instanceof MissionApiError && error.status >= 400 && error.status < 500 && error.status !== 409) remember(proposal.id, null);
        setNotice(error instanceof MissionApiError && error.status < 500 ? message(error)
          : "Decision outcome uncertain: repeat the same action to verify it.");
      }
    } finally { setBusy(false); }
  }
  function changeActivity(index: number, patch: Partial<ScheduleActivity>) {
    setDraft((old) => old ? { ...old, activities: old.activities.map((item, i) => i === index ? { ...item, ...patch } : item) } : old);
  }
  function addActivity() {
    if (!draft) return;
    const end = new Date(Date.parse(draft.dayStartsAt) + 30 * 60_000).toISOString();
    setDraft({ ...draft, activities: [...draft.activities, { id: `activity-${crypto.randomUUID()}`, title: "New activity", kind: "MISSION",
      startsAt: draft.dayStartsAt, endsAt: end, earliestStart: draft.dayStartsAt, latestEnd: draft.dayEndsAt,
      priority: "NORMAL", movable: true, dependsOn: [] }] });
  }

  return <section className={styles.workspace} aria-label={ground ? "Ground operations" : "Astronaut schedule"}>
    <header className={styles.heading}><div><span className={styles.kicker}>{ground ? "HOUSTON / OPERATIONS" : "ISS / SCHEDULE"}</span>
      <h1>{ground ? "Reports and schedule" : "Daily schedule"}</h1><p>Local demo · times in UTC</p><p>Use the value of {ground ? "AGENT_GROUND_TOKEN" : demoCrewMappings.find((member) => member.astronautId === astronaut)?.tokenEnv} configured on the server.</p></div><button type="button" onClick={onBack}>Back to dashboard</button></header>
    <form className={styles.controls} onSubmit={(event) => { event.preventDefault(); void load(); }}>
      <label>Token {ground ? "Ground" : "astronaut"}<input type="password" autoComplete="off" value={token} onChange={(event) => { setToken(event.target.value); setLoaded(false); }} disabled={busy || lockSelection} required /></label>
      <label>Astronaut<select value={astronaut} onChange={(event) => { setAstronaut(event.target.value); setLoaded(false); }} disabled={busy || lockSelection}>{demoCrewMappings.map((member) => <option key={member.astronautId} value={member.astronautId}>{member.name}</option>)}</select></label>
      <label>UTC date<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setLoaded(false); }} disabled={busy || lockSelection} required /></label>
      <button type="submit" disabled={busy || lockSelection}>{busy ? "Loading…" : "Load data"}</button>
    </form>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {loaded && schedule && <>
      <section className={styles.card}><div className={styles.sectionHeader}><div><span className={styles.kicker}>SHARED SCHEDULE</span><h2>Schedule · version {schedule.version}</h2></div>
        {ground && <button type="button" disabled={busy || conflict || !draft || JSON.stringify(draft) === JSON.stringify(schedule)} onClick={() => void save()}>Save schedule</button>}</div>
        {dirty && !conflict && <p>Save or discard changes before changing the selection. <button type="button" disabled={busy} onClick={() => setDraft(structuredClone(schedule))}>Discard changes</button></p>}
        {conflict && <p className={styles.notice}>Reload data before making further changes.</p>}
        {!ground && <ol className={styles.list}>{schedule.activities.map((activity) => <li key={activity.id}><strong>{activityTitle(activity.title)}</strong><span>{format(activity.startsAt)} – {format(activity.endsAt)}</span></li>)}</ol>}
        {ground && draft && <><p>Edit activities and save the complete schedule. Dates and times are UTC. Shared resource IDs must match across crew schedules; leave blank when none are assigned.</p>
          {draft.activities.map((activity, index) => <fieldset className={styles.activity} key={activity.id} disabled={busy || conflict}>
            <legend>Activity {index + 1}</legend>
            <label>Name<input value={activityTitle(activity.title)} onChange={(e) => changeActivity(index, { title: e.target.value })} /></label>
            <label>Start<input type="datetime-local" value={inputTime(activity.startsAt)} onChange={(e) => changeActivity(index, { startsAt: utcTime(e.target.value) })} /></label>
            <label>End<input type="datetime-local" value={inputTime(activity.endsAt)} onChange={(e) => changeActivity(index, { endsAt: utcTime(e.target.value) })} /></label>
            <label>Earliest start<input type="datetime-local" value={inputTime(activity.earliestStart)} onChange={(e) => changeActivity(index, { earliestStart: utcTime(e.target.value) })} /></label>
            <label>Latest end<input type="datetime-local" value={inputTime(activity.latestEnd)} onChange={(e) => changeActivity(index, { latestEnd: utcTime(e.target.value) })} /></label>
            <label>Type<select value={activity.kind} onChange={(e) => changeActivity(index, { kind: e.target.value as ScheduleActivity["kind"] })}>{["MISSION", "EXERCISE", "MEAL", "REST", "PERSONAL"].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Priority<select value={activity.priority} onChange={(e) => changeActivity(index, { priority: e.target.value as ScheduleActivity["priority"] })}>{["LOW", "NORMAL", "CRITICAL"].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Shared resource IDs (comma separated)<input key={`${activity.id}-${(activity.sharedResources ?? []).join(",")}`} defaultValue={(activity.sharedResources ?? []).join(", ")} onBlur={(e) => changeActivity(index, { sharedResources: e.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} placeholder="e.g. lab-terminal" /></label>
            <label className={styles.check}><input type="checkbox" checked={activity.movable} onChange={(e) => changeActivity(index, { movable: e.target.checked })} /> Movable</label>
            <button type="button" onClick={() => setDraft({ ...draft, activities: draft.activities.filter((_, i) => i !== index) })}>Remove</button>
          </fieldset>)}
          <button type="button" disabled={busy || conflict || draft.activities.length >= 200} onClick={addActivity}>Add activity</button>
        </>}
      </section>
      {ground && <>
        <section className={styles.card}><span className={styles.kicker}>GROUND CONTROL</span><h2>Agent reports</h2>
          {!reports.length && <p>No reports available.</p>}
          {reports.map((report) => <article className={styles.item} key={report.id}><h3>Check-in {report.checkInId}</h3><p>{format(report.generatedAt)}{report.humanReview.required ? " · Human review required" : ""}</p>
            {report.humanReview.reason && <p>{report.humanReview.reason}</p>}
            {report.findings.map((finding, i) => <p key={`finding-${i}`}><strong>{finding.source}:</strong> {finding.text}</p>)}
            {report.discrepancies.map((finding, i) => <p key={`difference-${i}`}><strong>Discrepancy:</strong> {finding.text}</p>)}
            {report.uncertainties.map((uncertainty, i) => <p key={`uncertainty-${i}`}><strong>Limitation:</strong> {uncertainty}</p>)}
            {!report.proposalId && <p>No proposal associated with this report.</p>}
          </article>)}
          {reportCursor && <button type="button" disabled={busy} onClick={() => void more("reports")}>Load more reports</button>}
        </section>
        <section className={styles.card}><span className={styles.kicker}>HUMAN REVIEW</span><h2>Schedule proposals</h2>
          {notice && <p className={styles.notice} role="status">{notice}</p>}
          {draft && JSON.stringify(draft) !== JSON.stringify(schedule) && <p>Save or reload the schedule before deciding on proposals.</p>}
          {!proposals.length && <p>No proposals available.</p>}
          {proposals.map((proposal) => {
            const sameSchedule = proposal.scheduleId === schedule.id && proposal.baseScheduleVersion === schedule.version;
            const preview = sameSchedule ? applyScheduleChanges(schedule, proposal.candidate.changes) : null;
            const pendingDecision = getPending(proposal.id);
            return <article className={styles.item} key={proposal.id}><div className={styles.sectionHeader}><h3>Proposal · {format(proposal.createdAt)}</h3><strong>{proposal.status}</strong></div>
              <p>{proposal.candidate.rationale}</p>
              {!preview && <p>The displayed schedule does not match the proposal version; select the correct date or request a new assessment.</p>}
              {preview && <ul>{proposal.candidate.changes.map((change) => {
                const before = schedule.activities.find((item) => item.id === change.activityId);
                const after = preview.activities.find((item) => item.id === change.activityId);
                return <li key={change.activityId}><strong>{before?.title ?? after?.title ?? change.activityId}</strong>: {before ? `${format(before.startsAt)} – ${format(before.endsAt)}` : "new rest break"} → {after ? `${format(after.startsAt)} – ${format(after.endsAt)}` : "unavailable"}</li>;
              })}</ul>}
              {pendingDecision && <p>Decision awaiting confirmation: repeat {pendingDecision.decision === "APPROVE" ? "approval" : "rejection"}.</p>}
              {(proposal.status === "PENDING_REVIEW" || pendingDecision) && <div className={styles.actions}>
                <button type="button" disabled={busy || conflict || JSON.stringify(draft) !== JSON.stringify(schedule) || (!preview && !pendingDecision) || (pendingDecision !== null && pendingDecision.decision !== "APPROVE")} onClick={() => void decide(proposal, "APPROVE")}>Approve</button>
                <button type="button" disabled={busy || conflict || JSON.stringify(draft) !== JSON.stringify(schedule) || (pendingDecision !== null && pendingDecision.decision !== "REJECT")} onClick={() => void decide(proposal, "REJECT")}>Reject</button>
              </div>}
            </article>;
          })}
          {proposalCursor && <button type="button" disabled={busy} onClick={() => void more("proposals")}>Load more proposals</button>}
        </section>
      </>}
    </>}
  </section>;
}
