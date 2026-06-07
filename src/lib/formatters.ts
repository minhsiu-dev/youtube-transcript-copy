import type { Segment, VideoMeta } from './types.js';

export function formatPlain(segments: Segment[]): string {
  return segments.map((s) => s.text).join('\n');
}

export function formatTimestamped(segments: Segment[]): string {
  return segments.map((s) => `[${formatTimestamp(s.start)}] ${s.text}`).join('\n');
}

export function formatWithHeader(segments: Segment[], meta: VideoMeta): string {
  return `${meta.title}\n${meta.url}\n\n${formatPlain(segments)}`;
}

function formatTimestamp(seconds: number): string {
  const total = Math.floor(seconds);
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
