import { afterEach, describe, expect, it, vi } from 'vitest';
import { AGENT_CHANNEL, AgentBridge, allowedParentOrigin } from './agent-bridge';

afterEach(() => vi.useRealTimers());
describe('collegamento agent', () => {
  it('accetta solo il genitore previsto', () => {
    expect(allowedParentOrigin('http://localhost:3000/voice-demo', 'http://localhost:3000')).toBe('http://localhost:3000');
    expect(allowedParentOrigin('http://evil.test/', 'http://localhost:3000')).toBeNull();
    expect(allowedParentOrigin('http://evil.test/', 'http://evil.test')).toBeNull();
    expect(allowedParentOrigin('http://127.0.0.1:3000/voice-demo', 'http://localhost:3000')).toBe('http://127.0.0.1:3000');
    expect(allowedParentOrigin('http://localhost:3001/voice-demo', 'http://localhost:3000')).toBeNull();
    expect(allowedParentOrigin('http://localhost.attacker.test:3000/', 'http://localhost:3000')).toBeNull();
  });
  it('ignora risposte estranee e ripete lo stesso contenuto e ID dopo il timeout', () => {
    vi.useFakeTimers();
    const sent: unknown[] = []; const states: string[] = [];
    const parent = { postMessage: (message: unknown, origin: string) => { expect(origin).toBe('http://localhost:3000'); sent.push(message); } };
    let listener: ((event: MessageEvent) => void) | undefined;
    const source = { parent, addEventListener: (_type: 'message', callback: (event: MessageEvent) => void) => { listener = callback; },
      removeEventListener: () => { listener = undefined; } };
    const bridge = new AgentBridge(source, 'http://localhost:3000', (state) => states.push(state), () => 'request-1');
    bridge.send('{"one":1}');
    listener?.({ source: {}, origin: 'http://localhost:3000', data: { channel: AGENT_CHANNEL, type: 'IMPORT_RESULT', requestId: 'request-1', ok: true } } as unknown as MessageEvent);
    expect(states).toEqual(['sending']);
    vi.advanceTimersByTime(15000); expect(states.at(-1)).toBe('failed');
    bridge.send('{"changed":2}'); expect(sent[0]).toEqual(sent[1]);
    listener?.({ source: parent, origin: 'http://localhost:3000', data: { channel: AGENT_CHANNEL, type: 'IMPORT_RESULT', requestId: 'request-1', ok: true } } as unknown as MessageEvent);
    expect(states.at(-1)).toBe('sent'); bridge.dispose(); expect(listener).toBeUndefined();
  });
});
