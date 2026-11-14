import { useEffect, useRef, useState } from 'react';
import { useWebcam } from '../capture/use-webcam';
import { SyntheticReplay } from '../ui/SyntheticReplay';
import { LiveSession } from './live-session';
import type { LiveSnapshot } from './live-session';
import { MediaPipeFaceLandmarkerAdapter } from '../inference/mediapipe-adapter';
import { runtimeAssets } from './runtime-config';
import { LiveChart } from '../ui/LiveChart';
import { downloadExport, downloadJson } from '../ui/download-export';
import { createSessionValidationReport } from '../validation/session-report';
import type { ApplicationPhase, SessionInterruptionReason } from '../contracts/session';
import { AgentBridge, allowedParentOrigin } from '../integration/agent-bridge';

const statusLabels = {
  idle: 'Spenta', requesting: 'Autorizzazione', starting: 'Avvio in corso',
  active: 'Anteprima attiva', suspended: 'Interrotta', error: 'Errore webcam',
};
const phaseLabels: Record<ApplicationPhase, string> = {
  idle: 'Inattiva', loading: 'Caricamento', preview: 'Anteprima', calibrating: 'Calibrazione',
  measuring: 'Misura in corso', stopped: 'Arrestata', suspended: 'Sospesa', error: 'Errore',
};
const interruptionLabels: Record<SessionInterruptionReason, string> = {
  user_stop: 'Arresto richiesto', source_changed: 'Sorgente cambiata', page_hidden: 'Scheda sospesa',
  device_lost: 'Fotocamera non disponibile', calibration_invalidated: 'Calibrazione non più valida',
  sample_limit: 'Limite di campioni raggiunto', processing_error: 'Errore durante l’elaborazione',
};

export function App() {
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [exportError, setExportError] = useState('');
  const [bridgeState, setBridgeState] = useState<'idle' | 'sending' | 'failed' | 'sent'>('idle');
  const [bridgeError, setBridgeError] = useState('');
  const bridge = useRef<AgentBridge | null>(null);
  const parentOrigin = window.parent === window ? null : allowedParentOrigin(document.referrer,
    import.meta.env.VITE_AGENT_ORIGIN?.trim() || 'http://localhost:3000');
  const [session] = useState(() => new LiveSession(new MediaPipeFaceLandmarkerAdapter({
    modelAssetPath: runtimeAssets.modelPath, wasmAssetPath: runtimeAssets.wasmPath,
  }), setLive));
  const { videoRef, snapshot, devices, deviceMessage, deviceId, start, stop, selectDevice } = useWebcam(
    session.consume,
    (state) => {
      session.handleCaptureState(state);
    },
    () => session.wantsFrames(),
  );
  useEffect(() => () => session.stop(), [session]);
  useEffect(() => {
    if (!parentOrigin) return;
    const current = new AgentBridge(window, parentOrigin, setBridgeState);
    bridge.current = current;
    return () => { current.dispose(); bridge.current = null; };
  }, [parentOrigin]);
  const [mirrored, setMirrored] = useState(true);
  const [showOverlay, setShowOverlay] = useState(false);
  const pending = snapshot.status === 'requesting' || snapshot.status === 'starting';
  const active = snapshot.status === 'active';
  const canStop = pending || active;

  return (
    <main className="page">
      <header className="brand">CrewReady <span>Prototipo locale</span></header>
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Osservazione palpebrale</p>
        <h1 id="page-title">Visione palpebrale</h1>
        <p className="description">
          Prepara l’inquadratura e verifica la tua fotocamera.
          Avvia l’anteprima quando sei pronto.
        </p>
      </section>
      <section className="camera-panel" aria-labelledby="camera-title">
        <div className="camera-heading">
          <h2 id="camera-title">La tua fotocamera</h2>
          <span className={`status status-${snapshot.status}`}>{statusLabels[snapshot.status]}</span>
        </div>
        <div className="camera-layout">
          <div className="preview-column">
            <div className="preview">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                aria-label="Anteprima della webcam"
                className={`${active ? 'video-visible' : ''} ${mirrored ? 'video-mirrored' : ''}`}
              />
              {active && showOverlay && live?.inference?.landmarks && <svg className={`camera-overlay ${mirrored ? 'video-mirrored' : ''}`} viewBox={`0 0 ${live.inference.geometry.imageWidth} ${live.inference.geometry.imageHeight}`} preserveAspectRatio="xMidYMid meet" aria-label="Punti palpebrali rilevati">
                {(['left', 'right'] as const).map((side) => {
                  const eye = live.inference!.landmarks![side];
                  const points = [eye.outerCorner, eye.upperOuter, eye.upperInner, eye.innerCorner, eye.lowerInner, eye.lowerOuter];
                  return <polygon key={side} points={points.map((point) => `${point.x * live.inference!.geometry.imageWidth},${point.y * live.inference!.geometry.imageHeight}`).join(' ')} fill="none" stroke={live.inference!.geometry[side].valid ? '#6ce6a2' : '#ffb66d'} strokeWidth="2" vectorEffect="non-scaling-stroke" />;
                })}
              </svg>}
              {!active && (
                <div className="preview-placeholder">
                  <svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <rect x="7" y="14" width="25" height="22" rx="5" />
                    <path d="m32 21 9-5v18l-9-5M15 9h9" />
                  </svg>
                  <strong>{pending ? 'Preparazione dell’anteprima…' : 'Anteprima non attiva'}</strong>
                  <span>{pending ? 'Puoi annullare premendo Arresta.' : 'Premi Avvia webcam per iniziare.'}</span>
                </div>
              )}
              {active && <span className="live-label"><span />In diretta</span>}
            </div>
            <label className="mirror-control">
              <input type="checkbox" checked={mirrored} onChange={(event) => setMirrored(event.target.checked)} />
              Anteprima a specchio
            </label>
            <label className="mirror-control"><input type="checkbox" checked={showOverlay} onChange={(event) => setShowOverlay(event.target.checked)} />Mostra punti palpebrali</label>
          </div>
          <div className="camera-controls">
            <label htmlFor="camera-device">Sorgente video</label>
            <select id="camera-device" value={deviceId} disabled={pending} onChange={(event) => selectDevice(event.target.value)}>
              <option value="">Fotocamera predefinita</option>
              {deviceId && !devices.some((device) => device.deviceId === deviceId) && (
                <option value={deviceId}>Fotocamera selezionata non disponibile</option>
              )}
              {devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>{device.label || `Fotocamera ${index + 1}`}</option>
              ))}
            </select>
            <p className="field-hint">L’elenco si aggiorna dopo l’autorizzazione. Cambiare sorgente arresta l’anteprima.</p>
            {deviceMessage && <p className="field-hint">{deviceMessage}</p>}
            <div className="camera-actions">
              <button className="button-primary" type="button" onClick={start} disabled={canStop}>Avvia webcam</button>
              <button className="button-secondary" type="button" onClick={stop} disabled={!canStop}>Arresta</button>
            </div>
            <div className={`camera-message ${snapshot.status === 'error' ? 'message-error' : ''}`}>
              <p role={snapshot.status === 'error' ? 'alert' : 'status'} aria-live="polite">{snapshot.message}</p>
            </div>
            {active && (
              <dl className="capture-details">
                <div><dt>Risoluzione video</dt><dd>{snapshot.width ? `${snapshot.width} × ${snapshot.height}` : 'In attesa di immagini'}</dd></div>
                <div><dt>Fotogrammi ricevuti</dt><dd>{snapshot.frameCount.toLocaleString('it-IT')}</dd></div>
              </dl>
            )}
            <p className="local-note">Solo video, senza audio. Le immagini restano in questa pagina e non vengono registrate o inviate.</p>
          </div>
        </div>
      </section>
      <section className="camera-panel" aria-labelledby="live-title">
        <div className="camera-heading"><h2 id="live-title">Calibrazione e misura</h2><span className="status">{phaseLabels[live?.phase ?? 'idle']}</span></div>
        <p role="status">{live?.message ?? 'Avvia la webcam, poi prepara l’analisi.'}</p>
        {live?.interruption && <p>Causa: {interruptionLabels[live.interruption]}.</p>}
        {live?.error && <p role="alert">Fase dell’errore: {live.error.stage}.</p>}
        <div className="camera-actions">
          <button className="button-primary" type="button" disabled={!active || !['idle', 'stopped', 'suspended', 'error'].includes(live?.phase ?? 'idle')} onClick={() => void session.start()}>Prepara analisi</button>
          <button className="button-secondary" type="button" disabled={!active || live?.phase !== 'preview'} onClick={() => session.startOpen()}>Calibra: occhi aperti</button>
          <button className="button-secondary" type="button" disabled={live?.phase !== 'calibrating' || live.calibration.status !== 'collecting' || live.calibration.reference !== 'open' || !live.progress?.open.complete} onClick={() => session.startClosed()}>Continua: occhi chiusi</button>
          <button className="button-secondary" type="button" disabled={live?.phase !== 'calibrating' || live.calibration.status !== 'collecting' || live.calibration.reference !== 'closed' || !live.progress?.closed.complete} onClick={() => session.finishCalibration()}>Completa calibrazione</button>
          <button className="button-primary" type="button" disabled={live?.phase !== 'preview' || live.calibration.status !== 'ready'} onClick={() => session.startMeasurement()}>Avvia misura</button>
          <button className="button-secondary" type="button" disabled={live?.phase !== 'measuring'} onClick={() => session.stopMeasurement()}>Arresta misura</button>
          <button className="button-secondary" type="button" disabled={!live || ['idle', 'stopped'].includes(live.phase)} onClick={() => session.stop()}>Chiudi analisi</button>
        </div>
        {live?.progress && <p>Campioni validi — aperti: sinistro {live.progress.open.samples.left}, destro {live.progress.open.samples.right}; chiusi: sinistro {live.progress.closed.samples.left}, destro {live.progress.closed.samples.right}. Richiesti per fase: {live.progress.open.requiredPerEye}.</p>}
        {live?.calibration.status === 'insufficient' && <p role="alert">Calibrazione non disponibile: {live.calibration.reasons.join(', ')}{live.calibration.details?.length ? ` (${live.calibration.details.join(', ')})` : ''}</p>}
        {live?.inference && <p>Qualità: {live.inference.message} Sinistro: {live.inference.geometry.left.valid ? 'valido' : live.inference.geometry.left.invalidityReasons.join(', ')}; destro: {live.inference.geometry.right.valid ? 'valido' : live.inference.geometry.right.invalidityReasons.join(', ')}.</p>}
        {live?.lastSample && (live.lastSample.left.validity === 'invalid' || live.lastSample.right.validity === 'invalid') && <p>Ultimo campione accettato non valutabile: sinistro {live.lastSample.left.validity === 'invalid' ? live.lastSample.left.reasons.join(', ') : 'valido'}; destro {live.lastSample.right.validity === 'invalid' ? live.lastSample.right.reasons.join(', ') : 'valido'}.</p>}
        {live?.engine && <div className="replay-grid">
          {(['left', 'right'] as const).map((side) => <article className="replay-card" key={side}><h3>Occhio {side === 'left' ? 'sinistro' : 'destro'}</h3><p>Stato: {{ open: 'Aperto', closed: 'Chiuso', unknown: 'Non valutabile' }[live.engine!.current[side].state]}</p><p>Apertura normalizzata: {live.engine!.current[side].openness?.toFixed(2) ?? 'Non disponibile'}</p></article>)}
          <article className="replay-card"><h3>Riepilogo</h3><p>Tempo valido: {live.engine.session.validMs.toFixed(0)} ms</p><p>Copertura: {live.engine.session.coverage === null ? 'Non disponibile' : `${(live.engine.session.coverage * 100).toFixed(1)}%`}</p><p>Quota temporale di chiusura sperimentale: {live.engine.session.closureFraction === null ? 'Non disponibile' : `${(live.engine.session.closureFraction * 100).toFixed(1)}%`}</p><p>Chiusure complete: {live.engine.session.closures.completeCount}; incomplete: {live.engine.session.closures.incompleteCount}</p></article>
        </div>}
        {live?.engine && <><h3>Andamento della misura</h3>{live.chartReduced && <p>Grafico semplificato; i campioni originali rimangono nell’esportazione.</p>}<LiveChart points={live.history} /><h3>Eventi bilaterali</h3>{live.engine.session.events.filter((event) => event.kind === 'bilateral').length === 0 ? <p>Nessun evento osservato.</p> : <ul>{live.engine.session.events.filter((event) => event.kind === 'bilateral').map((event) => <li key={event.id}>{event.durationMs.toFixed(0)} ms · {event.complete ? 'completo' : 'incompleto'} · {event.endedReason ?? 'in corso'}</li>)}</ul>}</>}
        <button className="button-secondary" type="button" disabled={!live?.engine || !live.exportProfile} onClick={() => {
          if (!live) return;
          try { downloadExport(session.exportSnapshot(live)); setExportError(''); }
          catch (error) { setExportError(error instanceof Error ? error.message : 'Esportazione non riuscita.'); }
        }}>Esporta JSON webcam</button>
        {parentOrigin && <>
          <button className="button-primary" type="button" disabled={bridgeState === 'sending' || (bridgeState !== 'failed' && (!live?.engine || live.engine.status !== 'stopped' || !live.exportProfile))} onClick={() => {
            try {
              if (bridgeState === 'failed') bridge.current?.send('');
              else if (live) bridge.current?.send(JSON.stringify(session.exportSnapshot(live)));
              setBridgeError('');
            } catch (error) { setBridgeError(error instanceof Error ? error.message : 'Invio non riuscito.'); }
          }}>{bridgeState === 'sending' ? 'Invio in corso…' : bridgeState === 'failed' ? 'Riprova invio all’agent' : 'Invia misura all’agent'}</button>
          {bridgeState === 'failed' && <button className="button-secondary" type="button" onClick={() => { bridge.current?.clear(); setBridgeError(''); }}>Annulla invio in sospeso</button>}
          {bridgeState === 'sent' && <p role="status">Misura ricevuta. Selezionala nella pagina dell’agent per usarla.</p>}
          {bridgeState === 'failed' && <p role="alert">Invio non confermato. Puoi riprovare oppure annullare: la misura potrebbe essere già arrivata all’agent.</p>}
          {bridgeError && <p role="alert">{bridgeError}</p>}
        </>}
        {exportError && <p role="alert">{exportError}</p>}
        <button className="button-secondary" type="button" disabled={!live?.engine || !live.exportProfile} onClick={() => {
          if (!live) return;
          try {
            const report = createSessionValidationReport(session.exportSnapshot(live));
            downloadJson(`crewready-prestazioni-${Date.now()}.json`, JSON.stringify(report, null, 2));
            setExportError('');
          } catch (error) { setExportError(error instanceof Error ? error.message : 'Report non disponibile.'); }
        }}>Esporta report N05</button>
      </section>
      <SyntheticReplay />
      <section className="session-note" aria-labelledby="next-title">
        <h2 id="next-title">Prima l’inquadratura, poi la misura</h2>
        <p>L’anteprima non avvia automaticamente una sessione di misura.</p>
        <p>Se lasci questa scheda o riduci il browser a icona, la fotocamera viene arrestata. Al ritorno premi Avvia per ripartire.</p>
        <p className="disclaimer">
          Le misure descriveranno il comportamento palpebrale osservato.
          Non forniscono diagnosi o valutazioni di idoneità.
        </p>
      </section>
    </main>
  );
}
