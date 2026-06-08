import type { Segment } from '../lib/types.js';

export function buildTranscriptUrl(baseUrl: string): string {
  // YouTube's default timedtext response is XML. The `fmt=json3` variant has
  // been observed to return empty bodies for many videos, so we strip any
  // existing `fmt` param and let YouTube serve XML.
  try {
    const u = new URL(baseUrl);
    u.searchParams.delete('fmt');
    return u.toString();
  } catch {
    return baseUrl.replace(/([?&])fmt=[^&]*&?/g, '$1').replace(/[?&]$/, '');
  }
}

export function parseTimedTextXml(xml: string): Segment[] {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return [];
  }
  const textNodes = Array.from(doc.getElementsByTagName('text'));
  const out: Segment[] = [];
  for (const node of textNodes) {
    const startAttr = node.getAttribute('start');
    const durAttr = node.getAttribute('dur');
    const start = startAttr === null ? 0 : parseFloat(startAttr);
    const duration = durAttr === null ? 0 : parseFloat(durAttr);
    const rawText = node.textContent ?? '';
    const text = decodeHtmlEntities(rawText);
    if (text.trim() === '') continue;
    out.push({ start, duration, text });
  }
  return out;
}

// YouTube's transcript XML double-encodes apostrophes etc. — `&amp;#39;`
// becomes `&#39;` after DOMParser's XML decode, and we still need the HTML
// entity decode pass to recover `'`.
function decodeHtmlEntities(text: string): string {
  const ta = document.createElement('textarea');
  ta.innerHTML = text;
  return ta.value;
}

export class EmptyTranscriptError extends Error {
  constructor() {
    super('Empty caption response.');
    this.name = 'EmptyTranscriptError';
  }
}

export interface PotParams {
  pot: string;
  c: string;
}

export async function fetchCaptionTrack(
  baseUrl: string,
  potParams: PotParams,
): Promise<Segment[]> {
  const base = buildTranscriptUrl(baseUrl);
  const u = new URL(base);
  u.searchParams.set('pot', potParams.pot);
  u.searchParams.set('c', potParams.c);
  const url = u.toString();
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Caption fetch failed: ${response.status} ${response.statusText}`,
    );
  }
  const body = await response.text();
  if (body.trim() === '') {
    // The user-facing "enable CC" message is constructed by the caller
    // (content-script). Throw a typed sentinel so the caller can
    // distinguish empty-body from HTTP errors and parse failures.
    throw new EmptyTranscriptError();
  }
  const segments = parseTimedTextXml(body);
  if (segments.length === 0) {
    const preview = body.slice(0, 120).replace(/\s+/g, ' ');
    throw new Error(
      `Caption response had no parseable segments. Got: ${preview}${body.length > 120 ? '…' : ''}`,
    );
  }
  return segments;
}
