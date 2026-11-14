export const AGENT_CHANNEL = 'crewready-vision-agent-v1';

export function allowedParentOrigin(referrer: string, configured: string): string | null {
  try {
    const allowed = new URL(configured);
    if (!['http:', 'https:'].includes(allowed.protocol) || allowed.username || allowed.password
      || allowed.pathname !== '/' || allowed.search || allowed.hash) return null;
    if (allowed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(allowed.hostname)) return null;
    return new URL(referrer).origin === allowed.origin ? allowed.origin : null;
  } catch { return null; }
}

type BridgeState = 'idle' | 'sending' | 'failed' | 'sent';
type Pending = { requestId: string; json: string };
interface BridgeWindow {
  parent: { postMessage(message: unknown, targetOrigin: string): void };
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

/** Sends only an explicit export; credentials stay in the host application. */
export class AgentBridge {
  private pending: Pending | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;
  private readonly listener = (event: MessageEvent) => {
    if (event.source !== this.source.parent || event.origin !== this.origin || !this.pending || !event.data
      || event.data.channel !== AGENT_CHANNEL || event.data.type !== 'IMPORT_RESULT'
      || event.data.requestId !== this.pending.requestId || typeof event.data.ok !== 'boolean') return;
    this.clearTimer(); this.active = false;
    if (event.data.ok) { this.pending = null; this.notify('sent'); }
    else this.notify('failed');
  };
  constructor(private readonly source: BridgeWindow, private readonly origin: string,
    private readonly notify: (state: BridgeState) => void, private readonly createId: () => string = () => crypto.randomUUID()) {
    source.addEventListener('message', this.listener);
  }
  send(json: string): void {
    if (this.active) return;
    if (!this.pending) {
      if (!json || new Blob([json]).size > 10 * 1024 * 1024) throw new Error('La misura supera il limite di 10 MiB.');
      this.pending = { requestId: this.createId(), json };
    }
    this.active = true; this.notify('sending');
    this.source.parent.postMessage({ channel: AGENT_CHANNEL, type: 'IMPORT', ...this.pending }, this.origin);
    this.timer = setTimeout(() => { this.active = false; this.timer = null; this.notify('failed'); }, 15000);
  }
  clear(): void { this.clearTimer(); this.active = false; this.pending = null; this.notify('idle'); }
  dispose(): void { this.clearTimer(); this.source.removeEventListener('message', this.listener); this.pending = null; this.active = false; }
  private clearTimer(): void { if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
