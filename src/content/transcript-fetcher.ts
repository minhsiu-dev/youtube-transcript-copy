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

export function buildJson3Url(baseUrl: string): string {
  try {
    const u = new URL(baseUrl);
    u.searchParams.set('fmt', 'json3');
    return u.toString();
  } catch {
    return baseUrl.includes('fmt=json3') ? baseUrl : `${baseUrl}&fmt=json3`;
  }
}

export async function fetchCaptionTrack(baseUrl: string): Promise<Segment[]> {
  const url = buildJson3Url(baseUrl);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Caption fetch failed: ${response.status} ${response.statusText}`,
    );
  }
  const body = await response.text();
  if (body.trim() === '') {
    throw new Error(
      `Caption fetch returned empty body (status ${response.status}). The caption URL may have expired — reload the YouTube page and try again.`,
    );
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    const preview = body.slice(0, 80).replace(/\s+/g, ' ');
    throw new Error(
      `Caption response was not JSON. Got: ${preview}${body.length > 80 ? '…' : ''}`,
    );
  }
  return parseJson3(payload);
}
