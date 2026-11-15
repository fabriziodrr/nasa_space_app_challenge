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
  idle: 'Off', requesting: 'Permission', starting: 'Starting',
  active: 'Preview active', suspended: 'Interrupted', error: 'Webcam error',
};
const phaseLabels: Record<ApplicationPhase, string> = {
  idle: 'Inactive', loading: 'Loading', preview: 'Preview', calibrating: 'Calibration',
  measuring: 'Measuring', stopped: 'Stopped', suspended: 'Suspended', error: 'Error',
};
const interruptionLabels: Record<SessionInterruptionReason, string> = {
  user_stop: 'Requested stop', source_changed: 'Source changed', page_hidden: 'Tab hidden',
  device_lost: 'Camera unavailable', calibration_invalidated: 'Calibration no longer valid',
  sample_limit: 'Sample limit reached', processing_error: 'Processing error',
};

export function App() {
  const [live, setLive] = useState<LiveSnapshot | null>(null);
  const [exportError, setExportError] = useState('');
  const [bridgeState, setBridgeState] = useState<'idle' | 'sending' | 'failed' | 'sent'>('idle');
  const [bridgeError, setBridgeError] = useState('');
  const bridge = useRef<AgentBridge | null>(null);
  const sentMeasurement = useRef(false);
  const measuring = useRef(false);
  const parentOrigin = window.parent === window ? null : allowedParentOrigin(document.referrer || new URLSearchParams(window.location.search).get('agent_origin') || '',
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
  useEffect(() => {
    if (live?.phase === 'measuring' && !measuring.current) {
      sentMeasurement.current = false;
      bridge.current?.clear();
    }
    measuring.current = live?.phase === 'measuring';
    if (!parentOrigin || !live?.engine || live.engine.status !== 'stopped' || !live.exportProfile || sentMeasurement.current) return;
    sentMeasurement.current = true;
    try {
      bridge.current?.send(JSON.stringify(session.exportSnapshot(live)));
      setBridgeError('');
    } catch (error) {
      setBridgeError(error instanceof Error ? error.message : 'Sending failed.');
    }
  }, [live, parentOrigin, session]);
  const [mirrored, setMirrored] = useState(true);
  const [showOverlay, setShowOverlay] = useState(false);
  const pending = snapshot.status === 'requesting' || snapshot.status === 'starting';
  const active = snapshot.status === 'active';
  const canStop = pending || active;

  return (
    <main className="page">
      <header className="brand">CrewReady <span>Local prototype</span></header>
      {!parentOrigin && <p role="alert">Measurement is local only: this page is not connected to an astronaut session. Open “Open eyelid vision” inside your agent check-in to send measurements to the report.</p>}
      {parentOrigin && <p role="status">Connected to your agent session. After stopping the measurement, wait for “Measurement connected to the agent”.</p>}
      <section className="intro" aria-labelledby="page-title">
        <p className="eyebrow">Eyelid observation</p>
        <h1 id="page-title">Eyelid measurement</h1>
        <p className="description">
          Frame your face and check your camera.
          Start the preview when you are ready.
        </p>
      </section>
      <section className="camera-panel" aria-labelledby="camera-title">
        <div className="camera-heading">
          <h2 id="camera-title">Your camera</h2>
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
                aria-label="Webcam preview"
                className={`${active ? 'video-visible' : ''} ${mirrored ? 'video-mirrored' : ''}`}
              />
              {active && showOverlay && live?.inference?.landmarks && <svg className={`camera-overlay ${mirrored ? 'video-mirrored' : ''}`} viewBox={`0 0 ${live.inference.geometry.imageWidth} ${live.inference.geometry.imageHeight}`} preserveAspectRatio="xMidYMid meet" aria-label="Detected eyelid landmarks">
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
                  <strong>{pending ? 'Preparing preview…' : 'Preview inactive'}</strong>
                  <span>{pending ? 'You can cancel by pressing Stop.' : 'Press Start webcam to begin.'}</span>
                </div>
              )}
              {active && <span className="live-label"><span />Live</span>}
            </div>
            <label className="mirror-control">
              <input type="checkbox" checked={mirrored} onChange={(event) => setMirrored(event.target.checked)} />
              Mirror preview
            </label>
            <label className="mirror-control"><input type="checkbox" checked={showOverlay} onChange={(event) => setShowOverlay(event.target.checked)} />Show eyelid landmarks</label>
          </div>
          <div className="camera-controls">
            <label htmlFor="camera-device">Video source</label>
            <select id="camera-device" value={deviceId} disabled={pending} onChange={(event) => selectDevice(event.target.value)}>
              <option value="">Default camera</option>
              {deviceId && !devices.some((device) => device.deviceId === deviceId) && (
                <option value={deviceId}>Selected camera unavailable</option>
              )}
              {devices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>
              ))}
            </select>
            <p className="field-hint">The list updates after permission is granted. Changing the source stops the preview.</p>
            {deviceMessage && <p className="field-hint">{deviceMessage}</p>}
            <div className="camera-actions">
              <button className="button-primary" type="button" onClick={start} disabled={canStop}>Start webcam</button>
              <button className="button-secondary" type="button" onClick={stop} disabled={!canStop}>Stop</button>
            </div>
            <div className={`camera-message ${snapshot.status === 'error' ? 'message-error' : ''}`}>
              <p role={snapshot.status === 'error' ? 'alert' : 'status'} aria-live="polite">{snapshot.message}</p>
            </div>
            {active && (
              <dl className="capture-details">
                <div><dt>Video resolution</dt><dd>{snapshot.width ? `${snapshot.width} × ${snapshot.height}` : 'Waiting for video'}</dd></div>
                <div><dt>Received frames</dt><dd>{snapshot.frameCount.toLocaleString('en-US')}</dd></div>
              </dl>
            )}
            <p className="local-note">Video only, no audio. Images stay on this page and are neither recorded nor transmitted.</p>
          </div>
        </div>
      </section>
      <section className="camera-panel" aria-labelledby="live-title">
        <div className="camera-heading"><h2 id="live-title">Calibration and measurement</h2><span className="status">{phaseLabels[live?.phase ?? 'idle']}</span></div>
        <p role="status">{live?.message ?? 'Start the webcam, then prepare the analysis.'}</p>
        {live?.interruption && <p>Reason: {interruptionLabels[live.interruption]}.</p>}
        {live?.error && <p role="alert">Error stage: {live.error.stage}.</p>}
        <div className="camera-actions">
          <button className="button-primary" type="button" disabled={!active || !['idle', 'stopped', 'suspended', 'error'].includes(live?.phase ?? 'idle')} onClick={() => void session.start()}>Prepare analysis</button>
          <button className="button-secondary" type="button" disabled={!active || live?.phase !== 'preview'} onClick={() => session.startOpen()}>Calibrate: eyes open</button>
          <button className="button-secondary" type="button" disabled={live?.phase !== 'calibrating' || live.calibration.status !== 'collecting' || live.calibration.reference !== 'open' || !live.progress?.open.complete} onClick={() => session.startClosed()}>Continue: eyes closed</button>
          <button className="button-secondary" type="button" disabled={live?.phase !== 'calibrating' || live.calibration.status !== 'collecting' || live.calibration.reference !== 'closed' || !live.progress?.closed.complete} onClick={() => session.finishCalibration()}>Complete calibration</button>
          <button className="button-primary" type="button" disabled={live?.phase !== 'preview' || live.calibration.status !== 'ready'} onClick={() => session.startMeasurement()}>Start measurement</button>
          <button className="button-secondary" type="button" disabled={live?.phase !== 'measuring'} onClick={() => session.stopMeasurement()}>Stop measurement</button>
          <button className="button-secondary" type="button" disabled={!live || ['idle', 'stopped'].includes(live.phase)} onClick={() => session.stop()}>Close analysis</button>
        </div>
        {live?.progress && <p>Valid samples — aperti: left {live.progress.open.samples.left}, right {live.progress.open.samples.right}; chiusi: left {live.progress.closed.samples.left}, right {live.progress.closed.samples.right}. Required per phase: {live.progress.open.requiredPerEye}.</p>}
        {live?.calibration.status === 'insufficient' && <p role="alert">Calibration unavailable: {live.calibration.reasons.join(', ')}{live.calibration.details?.length ? ` (${live.calibration.details.join(', ')})` : ''}</p>}
        {live?.inference && <p>Quality: {live.inference.message} Sinistro: {live.inference.geometry.left.valid ? 'valid' : live.inference.geometry.left.invalidityReasons.join(', ')}; right: {live.inference.geometry.right.valid ? 'valid' : live.inference.geometry.right.invalidityReasons.join(', ')}.</p>}
        {live?.lastSample && (live.lastSample.left.validity === 'invalid' || live.lastSample.right.validity === 'invalid') && <p>Latest accepted sample unusable: left {live.lastSample.left.validity === 'invalid' ? live.lastSample.left.reasons.join(', ') : 'valid'}; right {live.lastSample.right.validity === 'invalid' ? live.lastSample.right.reasons.join(', ') : 'valid'}.</p>}
        {live?.engine && <div className="replay-grid">
          {(['left', 'right'] as const).map((side) => <article className="replay-card" key={side}><h3>Eye {side === 'left' ? 'left' : 'right'}</h3><p>Stato: {{ open: 'Open', closed: 'Closed', unknown: 'Unusable' }[live.engine!.current[side].state]}</p><p>Normalized openness: {live.engine!.current[side].openness?.toFixed(2) ?? 'Unavailable'}</p></article>)}
          <article className="replay-card"><h3>Summary</h3><p>Valid time: {live.engine.session.validMs.toFixed(0)} ms</p><p>Coverage: {live.engine.session.coverage === null ? 'Unavailable' : `${(live.engine.session.coverage * 100).toFixed(1)}%`}</p><p>Experimental closure time fraction: {live.engine.session.closureFraction === null ? 'Unavailable' : `${(live.engine.session.closureFraction * 100).toFixed(1)}%`}</p><p>Complete closures: {live.engine.session.closures.completeCount}; incomplete: {live.engine.session.closures.incompleteCount}</p></article>
        </div>}
        {live?.engine && <><h3>Measurement timeline</h3>{live.chartReduced && <p>Simplified chart; original samples remain in the export.</p>}<LiveChart points={live.history} /><h3>Bilateral events</h3>{live.engine.session.events.filter((event) => event.kind === 'bilateral').length === 0 ? <p>No events observed.</p> : <ul>{live.engine.session.events.filter((event) => event.kind === 'bilateral').map((event) => <li key={event.id}>{event.durationMs.toFixed(0)} ms · {event.complete ? 'complete' : 'incomplete'} · {event.endedReason ?? 'in progress'}</li>)}</ul>}</>}
        <button className="button-secondary" type="button" disabled={!live?.engine || !live.exportProfile} onClick={() => {
          if (!live) return;
          try { downloadExport(session.exportSnapshot(live)); setExportError(''); }
          catch (error) { setExportError(error instanceof Error ? error.message : 'Export failed.'); }
        }}>Export webcam JSON</button>
        {!parentOrigin && <p role="alert">These results have not been sent. A standalone vision page cannot attach them to an astronaut. Keep this page open to export your measurement, or start vision from the agent session.</p>}
        {parentOrigin && <>
          <button className="button-primary" type="button" disabled={bridgeState === 'sending' || (bridgeState !== 'failed' && (!live?.engine || live.engine.status !== 'stopped' || !live.exportProfile))} onClick={() => {
            try {
              if (bridgeState === 'failed') bridge.current?.send('');
              else if (live) bridge.current?.send(JSON.stringify(session.exportSnapshot(live)));
              setBridgeError('');
            } catch (error) { setBridgeError(error instanceof Error ? error.message : 'Sending failed.'); }
          }}>{bridgeState === 'sending' ? 'Sending…' : bridgeState === 'failed' ? 'Retry sending to agent' : 'Send measurement to agent'}</button>
          {bridgeState === 'failed' && <button className="button-secondary" type="button" onClick={() => { bridge.current?.clear(); setBridgeError(''); }}>Cancel pending submission</button>}
          {bridgeState === 'sent' && <p role="status">Measurement connected to the agent.</p>}
          {bridgeState === 'failed' && <p role="alert">Submission unconfirmed. Retry or cancel; the measurement may already have reached the agent.</p>}
          {bridgeError && <p role="alert">{bridgeError}</p>}
        </>}
        {exportError && <p role="alert">{exportError}</p>}
        <button className="button-secondary" type="button" disabled={!live?.engine || !live.exportProfile} onClick={() => {
          if (!live) return;
          try {
            const report = createSessionValidationReport(session.exportSnapshot(live));
            downloadJson(`crewready-prestazioni-${Date.now()}.json`, JSON.stringify(report, null, 2));
            setExportError('');
          } catch (error) { setExportError(error instanceof Error ? error.message : 'Report unavailable.'); }
        }}>Export N05 report</button>
      </section>
      <SyntheticReplay />
      <section className="session-note" aria-labelledby="next-title">
        <h2 id="next-title">Frame your face before measuring</h2>
        <p>The preview does not automatically start a measurement session.</p>
        <p>Leaving this tab or minimizing the browser stops the camera. Press Start when you return.</p>
        <p className="disclaimer">
          Measurements describe observed eyelid behavior.
          They do not provide a diagnosis or fitness assessment.
        </p>
      </section>
    </main>
  );
}
