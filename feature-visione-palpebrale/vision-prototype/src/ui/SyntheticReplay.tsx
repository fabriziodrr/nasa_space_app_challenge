import { useEffect, useMemo, useState } from 'react';
import { fixtures } from '../../fixtures';
import { prepareReplay } from '../app/replay';
import type { EyeObservation } from '../contracts/sample';
import { createSessionExport } from '../integration/session-export';
import { downloadExport } from './download-export';

const percent = (value: number | null) => value === null ? 'Non disponibile' : `${(value * 100).toFixed(1)}%`;
const ms = (value: number | null) => value === null ? 'Non disponibile' : `${value.toFixed(0)} ms`;
const states = { unknown: 'Non valutabile', open: 'Aperto', closed: 'Chiuso' };
function reasons(eye: EyeObservation | undefined) {
  return eye?.validity === 'invalid' ? eye.reasons.join(', ') : 'Nessuno';
}

export function SyntheticReplay() {
  const [selected, setSelected] = useState(fixtures[0]?.name ?? '');
  const fixture = fixtures.find((item) => item.name === selected) ?? fixtures[0];
  const replay = useMemo(() => fixture ? prepareReplay(fixture) : null, [fixture]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!playing || !replay) return;
    const next = index + 1;
    if (next >= replay.steps.length) {
      setPlaying(false);
      setFinished(true);
      return;
    }
    const currentTime = replay.steps[index]?.sample.timestampMs;
    const nextTime = replay.steps[next]?.sample.timestampMs;
    const delay = currentTime === undefined || nextTime === undefined ? 0 : Math.max(0, nextTime - currentTime);
    const timer = window.setTimeout(() => setIndex(next), delay);
    return () => window.clearTimeout(timer);
  }, [playing, replay, index]);

  if (!fixture || !replay) return <section className="camera-panel">Nessuno scenario sintetico disponibile.</section>;
  const step = replay.steps[index];
  const snapshot = finished ? replay.final : step?.snapshot;
  const points = replay.steps.slice(0, index + 1);
  const first = points[0]?.sample.timestampMs ?? 0;
  const last = points.at(-1)?.sample.timestampMs ?? first;
  const span = Math.max(1, last - first);
  const x = (time: number) => 40 + ((time - first) / span) * 720;
  const y = (value: number) => 160 - Math.max(0, Math.min(1, value)) * 120;
  const play = () => {
    try {
      setError(null);
      if (finished || index >= replay.steps.length - 1) { setIndex(-1); setFinished(false); }
      setPlaying(true);
    } catch { setError('Impossibile avviare lo scenario sintetico.'); }
  };

  return <section className="camera-panel" aria-labelledby="replay-title">
    <div className="camera-heading"><h2 id="replay-title">Replay sintetico</h2><span className="status">Dati simulati</span></div>
    <p>Scenari riproducibili senza webcam. I risultati descrivono esclusivamente i dati sintetici.</p>
    <label htmlFor="fixture">Scenario</label>{' '}
    <select id="fixture" value={fixture.name} disabled={playing} onChange={(event) => { setSelected(event.target.value); setIndex(-1); setFinished(false); setError(null); }}>
      {fixtures.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
    </select>
    <p className="field-hint">{fixture.description}</p>
    <div className="camera-actions">
      <button className="button-primary" type="button" onClick={play} disabled={playing}>{index >= 0 && !finished ? 'Riprendi' : 'Avvia replay'}</button>
      <button className="button-secondary" type="button" onClick={() => setPlaying(false)} disabled={!playing}>Pausa</button>
      <button className="button-secondary" type="button" onClick={() => { setPlaying(false); setIndex(-1); setFinished(false); setError(null); }} disabled={index < 0 && !playing}>Azzera</button>
    </div>
    <p role="status">{error ?? (playing ? 'Riproduzione in corso' : finished ? 'Replay completato' : index >= 0 ? 'Replay in pausa' : 'Pronto per il replay')}</p>
    {snapshot && <>
      <div className="replay-grid">
        {(['left', 'right'] as const).map((side) => <article className="replay-card" key={side}>
          <h3>Occhio {side === 'left' ? 'sinistro' : 'destro'}</h3>
          <p>{states[snapshot.current[side].state]}</p>
          <p>Apertura normalizzata: {snapshot.current[side].openness === null ? 'Non disponibile' : snapshot.current[side].openness.toFixed(2)}</p>
          <p>Motivi di invalidità: {reasons(step?.sample[side])}</p>
        </article>)}
      </div>
      <h3>Andamento dell’apertura</h3>
      <p className="field-hint">Verde: sinistro · Blu: destro · Fasce grigie: intervalli non valutabili. Scala grafica limitata a 0–1; i valori numerici restano originali.</p>
      <svg className="replay-chart" viewBox="0 0 800 200" role="img" aria-label="Grafico temporale dell'apertura dei due occhi e degli intervalli non valutabili">
        <line x1="40" y1="40" x2="760" y2="40" stroke="#ccd8d1" /><line x1="40" y1="160" x2="760" y2="160" stroke="#ccd8d1" />
        <text x="8" y="45">1</text><text x="8" y="165">0</text>
        {points.slice(1).map((point, i) => {
          const previous = points[i];
          if (!previous) return null;
          const invalid = point.gap || point.calibrationChanged || previous.sample.left.validity === 'invalid' || previous.sample.right.validity === 'invalid';
          return invalid ? <rect key={`gap-${i}`} x={x(previous.sample.timestampMs)} y="40" width={Math.max(1, x(point.sample.timestampMs) - x(previous.sample.timestampMs))} height="120" fill="#d9dedb" /> : null;
        })}
        {(['left', 'right'] as const).flatMap((side) => points.slice(1).map((point, i) => {
          const previous = points[i];
          if (!previous || point.gap || point.calibrationChanged) return null;
          const a = previous.sample[side], b = point.sample[side];
          if (a.validity !== 'valid') return null;
          const end = x(point.sample.timestampMs);
          return <path key={`${side}-${i}`} d={`M ${x(previous.sample.timestampMs)} ${y(a.openness)} H ${end}${b.validity === 'valid' ? ` V ${y(b.openness)}` : ''}`} fill="none" stroke={side === 'left' ? '#287a55' : '#346caa'} strokeWidth="3" />;
        }))}
        <text x="40" y="190">{first} ms</text><text x="675" y="190">{last} ms</text>
      </svg>
      <h3>Riepilogo della sessione</h3>
      <dl className="capture-details">
        <div><dt>Tempo osservato</dt><dd>{ms(snapshot.session.elapsedMs)}</dd></div>
        <div><dt>Tempo bilaterale valido</dt><dd>{ms(snapshot.session.validMs)}</dd></div>
        <div><dt>Copertura</dt><dd>{percent(snapshot.session.coverage)}</dd></div>
        <div><dt>Quota temporale di chiusura sperimentale</dt><dd>{percent(snapshot.session.closureFraction)}</dd></div>
        <div><dt>Chiusure bilaterali complete / incomplete</dt><dd>{snapshot.session.closures.completeCount} / {snapshot.session.closures.incompleteCount}</dd></div>
        <div><dt>Massima chiusura completa</dt><dd>{ms(snapshot.session.closures.longestCompleteMs)}</dd></div>
        <div><dt>Campioni rifiutati</dt><dd>{snapshot.diagnostics.rejectedSamples}</dd></div>
      </dl>
      <h3>Eventi bilaterali</h3>
      {snapshot.session.events.filter((event) => event.kind === 'bilateral').length === 0 ? <p>Nessun evento osservato.</p> : <ul>{snapshot.session.events.filter((event) => event.kind === 'bilateral').map((event) => <li key={event.id}>{ms(event.startedAtMs)}: {ms(event.durationMs)} · {event.complete ? 'completo' : 'incompleto'} · {event.endedReason ?? 'in corso'}</li>)}</ul>}
      <button className="button-secondary" type="button" onClick={() => {
        try {
          const lastSample = step ? fixture.samples.indexOf(step.sample) : -1;
          const samples = finished ? fixture.samples : fixture.samples.slice(0, lastSample + 1);
          downloadExport(createSessionExport({ source: 'synthetic', fixture, snapshot, samples }, new Date().toISOString()));
          setError(null);
        } catch (failure) { setError(failure instanceof Error ? failure.message : 'Esportazione non riuscita.'); }
      }}>Esporta JSON sintetico</button>
    </>}
  </section>;
}
