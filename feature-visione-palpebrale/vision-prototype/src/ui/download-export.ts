import { serializeSessionExport } from '../integration/session-export';
import type { SessionExport } from '../integration/session-export';

export function downloadExport(data: SessionExport): void {
  downloadJson(`crewready-${data.source.kind}-${Date.now()}.json`, serializeSessionExport(data));
}

export function downloadJson(filename: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  let link: HTMLAnchorElement | undefined;
  try {
    link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
  } finally {
    link?.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
