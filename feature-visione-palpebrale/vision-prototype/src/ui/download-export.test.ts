import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadJson } from './download-export';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('download JSON', () => {
  it.each([false, true])('aggiunge e rimuove il link e rilascia l’URL anche se click fallisce: %s', (fail) => {
    vi.useFakeTimers();
    const link = { href: '', download: '', hidden: false, click: vi.fn(() => { if (fail) throw new Error('download'); }), remove: vi.fn() };
    const appendChild = vi.fn();
    vi.stubGlobal('document', { createElement: () => link, body: { appendChild } });
    vi.stubGlobal('window', { setTimeout });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    if (fail) expect(() => downloadJson('test.json', '{}')).toThrow('download');
    else downloadJson('test.json', '{}');
    expect(create).toHaveBeenCalledOnce();
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(link.click).toHaveBeenCalledOnce();
    expect(link.remove).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
});
