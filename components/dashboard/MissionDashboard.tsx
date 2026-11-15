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
function message(error: unknown) {
  if (error instanceof MissionApiError) {
    if (error.status === 401) return "Token non riconosciuto.";
    if (error.status === 403) return "Operazione riservata alla sala di controllo.";
    if (error.status === 404) return "Risorsa non disponibile per questo astronauta.";
    if (error.status === 409) return "Il programma o la proposta sono cambiati. Ricarica i dati prima di continuare.";
    if (error.status === 400) return "Dati non validi: controlla orari, finestre e sovrapposizioni.";
  }
  return "Servizio non disponibile o risposta non valida. Riprova.";
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
    if (!valid.success) { setNotice("Controlla che tutti i campi e gli orari del programma siano validi."); return; }
    setBusy(true); setNotice("");
    try {
      const updated = await saveSchedule(token, valid.data);
      setSchedule(updated); setDraft(structuredClone(updated)); setNotice(`Programma aggiornato alla versione ${updated.version}.`);
    } catch (error) {
      if (!(error instanceof MissionApiError) || error.status >= 500 || error.status === 409) setConflict(true);
      setNotice(error instanceof MissionApiError && error.status === 409 ? message(error)
        : !(error instanceof MissionApiError) || error.status >= 500 ? "Esito del salvataggio incerto: ricarica il programma prima di riprovare." : message(error));
    } finally { setBusy(false); }
  }
  async function decide(proposal: ScheduleProposal, decision: Decision) {
    const previous = getPending(proposal.id);
    if (previous && previous.decision !== decision) { setNotice("Una decisione è ancora da verificare: ripeti la stessa operazione."); return; }
    const operation = previous ?? { decision, key: crypto.randomUUID() };
    remember(proposal.id, operation); setBusy(true); setNotice("");
    try {
      const result = await decideProposal(token, proposal.id, operation.decision, operation.key);
      setProposals((old) => old.map((item) => item.id === proposal.id ? result.proposal : item));
      if (result.proposal.status === "APPLIED" && result.schedule) {
        if (result.schedule.date === date) { setSchedule(result.schedule); setDraft(structuredClone(result.schedule)); }
        remember(proposal.id, null); setNotice("Proposta approvata e programma aggiornato.");
      } else if (result.proposal.status === "REJECTED") { remember(proposal.id, null); setNotice("Proposta rifiutata; il programma resta invariato."); }
      else if (result.proposal.status === "APPLY_FAILED") { remember(proposal.id, null); setNotice("L’applicazione della proposta non è riuscita. Il programma non risulta aggiornato: richiedi una nuova valutazione."); }
      else setNotice("Decisione registrata, ma aggiornamento non ancora confermato. Ripeti la stessa operazione per verificarne l’esito.");
    } catch (error) {
      if (error instanceof MissionApiError && error.status === 409 && error.code === "VERSION_CONFLICT") {
        remember(proposal.id, null); setConflict(true); setNotice("Proposta obsoleta: ricarica il programma e richiedi una nuova valutazione.");
      } else {
        if (!previous && error instanceof MissionApiError && error.status >= 400 && error.status < 500 && error.status !== 409) remember(proposal.id, null);
        setNotice(error instanceof MissionApiError && error.status < 500 ? message(error)
          : "Esito della decisione incerto: ripeti la stessa operazione per verificarlo.");
      }
    } finally { setBusy(false); }
  }
  function changeActivity(index: number, patch: Partial<ScheduleActivity>) {
    setDraft((old) => old ? { ...old, activities: old.activities.map((item, i) => i === index ? { ...item, ...patch } : item) } : old);
  }
  function addActivity() {
    if (!draft) return;
    const end = new Date(Date.parse(draft.dayStartsAt) + 30 * 60_000).toISOString();
    setDraft({ ...draft, activities: [...draft.activities, { id: `activity-${crypto.randomUUID()}`, title: "Nuova attività", kind: "MISSION",
      startsAt: draft.dayStartsAt, endsAt: end, earliestStart: draft.dayStartsAt, latestEnd: draft.dayEndsAt,
      priority: "NORMAL", movable: true, dependsOn: [] }] });
  }

  return <section className={styles.workspace} aria-label={ground ? "Operazioni di Terra" : "Programma astronauta"}>
    <header className={styles.heading}><div><span className={styles.kicker}>{ground ? "HOUSTON / OPERATIONS" : "ISS / SCHEDULE"}</span>
      <h1>{ground ? "Report e programma" : "Programma della giornata"}</h1><p>Demo locale · orari in UTC</p><p>Usa il valore di {ground ? "AGENT_GROUND_TOKEN" : demoCrewMappings.find((member) => member.astronautId === astronaut)?.tokenEnv} configurato sul server.</p></div><button type="button" onClick={onBack}>Torna alla dashboard</button></header>
    <form className={styles.controls} onSubmit={(event) => { event.preventDefault(); void load(); }}>
      <label>Token {ground ? "Terra" : "astronauta"}<input type="password" autoComplete="off" value={token} onChange={(event) => { setToken(event.target.value); setLoaded(false); }} disabled={busy || lockSelection} required /></label>
      <label>Astronauta<select value={astronaut} onChange={(event) => { setAstronaut(event.target.value); setLoaded(false); }} disabled={busy || lockSelection}>{demoCrewMappings.map((member) => <option key={member.astronautId} value={member.astronautId}>{member.name}</option>)}</select></label>
      <label>Data UTC<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setLoaded(false); }} disabled={busy || lockSelection} required /></label>
      <button type="submit" disabled={busy || lockSelection}>{busy ? "Caricamento…" : "Carica dati"}</button>
    </form>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {loaded && schedule && <>
      <section className={styles.card}><div className={styles.sectionHeader}><div><span className={styles.kicker}>PROGRAMMA CONDIVISO</span><h2>Schedule · versione {schedule.version}</h2></div>
        {ground && <button type="button" disabled={busy || conflict || !draft || JSON.stringify(draft) === JSON.stringify(schedule)} onClick={() => void save()}>Salva programma</button>}</div>
        {dirty && !conflict && <p>Salva o annulla le modifiche prima di cambiare selezione. <button type="button" disabled={busy} onClick={() => setDraft(structuredClone(schedule))}>Annulla modifiche</button></p>}
        {conflict && <p className={styles.notice}>Ricarica i dati prima di effettuare altre modifiche.</p>}
        {!ground && <ol className={styles.list}>{schedule.activities.map((activity) => <li key={activity.id}><strong>{activity.title}</strong><span>{format(activity.startsAt)} – {format(activity.endsAt)}</span></li>)}</ol>}
        {ground && draft && <><p>Modifica le attività e salva il programma completo. Date e orari sono UTC.</p>
          {draft.activities.map((activity, index) => <fieldset className={styles.activity} key={activity.id} disabled={busy || conflict}>
            <legend>Attività {index + 1}</legend>
            <label>Nome<input value={activity.title} onChange={(e) => changeActivity(index, { title: e.target.value })} /></label>
            <label>Inizio<input type="datetime-local" value={inputTime(activity.startsAt)} onChange={(e) => changeActivity(index, { startsAt: utcTime(e.target.value) })} /></label>
            <label>Fine<input type="datetime-local" value={inputTime(activity.endsAt)} onChange={(e) => changeActivity(index, { endsAt: utcTime(e.target.value) })} /></label>
            <label>Inizio consentito<input type="datetime-local" value={inputTime(activity.earliestStart)} onChange={(e) => changeActivity(index, { earliestStart: utcTime(e.target.value) })} /></label>
            <label>Fine consentita<input type="datetime-local" value={inputTime(activity.latestEnd)} onChange={(e) => changeActivity(index, { latestEnd: utcTime(e.target.value) })} /></label>
            <label>Tipo<select value={activity.kind} onChange={(e) => changeActivity(index, { kind: e.target.value as ScheduleActivity["kind"] })}>{["MISSION", "EXERCISE", "MEAL", "REST", "PERSONAL"].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label>Priorità<select value={activity.priority} onChange={(e) => changeActivity(index, { priority: e.target.value as ScheduleActivity["priority"] })}>{["LOW", "NORMAL", "CRITICAL"].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className={styles.check}><input type="checkbox" checked={activity.movable} onChange={(e) => changeActivity(index, { movable: e.target.checked })} /> Spostabile</label>
            <button type="button" onClick={() => setDraft({ ...draft, activities: draft.activities.filter((_, i) => i !== index) })}>Rimuovi</button>
          </fieldset>)}
          <button type="button" disabled={busy || conflict || draft.activities.length >= 200} onClick={addActivity}>Aggiungi attività</button>
        </>}
      </section>
      {ground && <>
        <section className={styles.card}><span className={styles.kicker}>SALA DI CONTROLLO</span><h2>Report dell’agent</h2>
          {!reports.length && <p>Nessun report disponibile.</p>}
          {reports.map((report) => <article className={styles.item} key={report.id}><h3>Check-in {report.checkInId}</h3><p>{format(report.generatedAt)}{report.humanReview.required ? " · Richiede revisione umana" : ""}</p>
            {report.humanReview.reason && <p>{report.humanReview.reason}</p>}
            {report.findings.map((finding, i) => <p key={`finding-${i}`}><strong>{finding.source}:</strong> {finding.text}</p>)}
            {report.discrepancies.map((finding, i) => <p key={`difference-${i}`}><strong>Da chiarire:</strong> {finding.text}</p>)}
            {report.uncertainties.map((uncertainty, i) => <p key={`uncertainty-${i}`}><strong>Limite:</strong> {uncertainty}</p>)}
            {!report.proposalId && <p>Nessuna proposta associata a questo report.</p>}
          </article>)}
          {reportCursor && <button type="button" disabled={busy} onClick={() => void more("reports")}>Carica altri report</button>}
        </section>
        <section className={styles.card}><span className={styles.kicker}>VALUTAZIONE UMANA</span><h2>Proposte di modifica</h2>
          {draft && JSON.stringify(draft) !== JSON.stringify(schedule) && <p>Salva o ricarica il programma prima di decidere sulle proposte.</p>}
          {!proposals.length && <p>Nessuna proposta disponibile.</p>}
          {proposals.map((proposal) => {
            const sameSchedule = proposal.scheduleId === schedule.id && proposal.baseScheduleVersion === schedule.version;
            const preview = sameSchedule ? applyScheduleChanges(schedule, proposal.candidate.changes) : null;
            const pendingDecision = getPending(proposal.id);
            return <article className={styles.item} key={proposal.id}><div className={styles.sectionHeader}><h3>Proposta · {format(proposal.createdAt)}</h3><strong>{proposal.status}</strong></div>
              <p>{proposal.candidate.rationale}</p>
              {!preview && <p>Il programma visualizzato non corrisponde alla versione della proposta; apri la data corretta o richiedi una nuova valutazione.</p>}
              {preview && <ul>{proposal.candidate.changes.map((change) => {
                const before = schedule.activities.find((item) => item.id === change.activityId);
                const after = preview.activities.find((item) => item.id === change.activityId);
                return <li key={change.activityId}><strong>{before?.title ?? after?.title ?? change.activityId}</strong>: {before ? `${format(before.startsAt)} – ${format(before.endsAt)}` : "nuova pausa"} → {after ? `${format(after.startsAt)} – ${format(after.endsAt)}` : "non disponibile"}</li>;
              })}</ul>}
              {pendingDecision && <p>Decisione da verificare: ripeti {pendingDecision.decision === "APPROVE" ? "l’approvazione" : "il rifiuto"}.</p>}
              {(proposal.status === "PENDING_REVIEW" || pendingDecision) && <div className={styles.actions}>
                <button type="button" disabled={busy || conflict || JSON.stringify(draft) !== JSON.stringify(schedule) || (!preview && !pendingDecision) || (pendingDecision !== null && pendingDecision.decision !== "APPROVE")} onClick={() => void decide(proposal, "APPROVE")}>Approva</button>
                <button type="button" disabled={busy || conflict || JSON.stringify(draft) !== JSON.stringify(schedule) || (pendingDecision !== null && pendingDecision.decision !== "REJECT")} onClick={() => void decide(proposal, "REJECT")}>Rifiuta</button>
              </div>}
            </article>;
          })}
          {proposalCursor && <button type="button" disabled={busy} onClick={() => void more("proposals")}>Carica altre proposte</button>}
        </section>
      </>}
    </>}
  </section>;
}
