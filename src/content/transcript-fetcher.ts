import type { Segment } from '../lib/types.js';

interface Json3Seg {
  utf8?: string;
}

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Json3Seg[];
}

interface Json3Payload {
  events?: Json3Event[];
}

export function parseJson3(payload: unknown): Segment[] {
  const events = (payload as Json3Payload | null)?.events;
  if (!Array.isArray(events)) {
    return [];
  }
  const out: Segment[] = [];
  for (const ev of events) {
    if (!Array.isArray(ev.segs)) continue;
    const text = ev.segs
      .map((s) => (typeof s.utf8 === 'string' ? s.utf8 : ''))
      .join('');
    if (text.trim() === '') continue;
    out.push({
      start: (ev.tStartMs ?? 0) / 1000,
      duration: (ev.dDurationMs ?? 0) / 1000,
      text,
    });
  }
  return out;
}

export async function fetchCaptionTrack(baseUrl: string): Promise<Segment[]> {
  const url = baseUrl.includes('fmt=json3') ? baseUrl : `${baseUrl}&fmt=json3`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Caption fetch failed: ${response.status} ${response.statusText}`,
    );
  }
  const payload = (await response.json()) as unknown;
  return parseJson3(payload);
}
