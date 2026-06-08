// In-memory LRU transcript cache, scoped to a single content-script
// instance (i.e. per tab).
//
// Keyed by (videoId, languageCode). Stores raw parsed Segments so format
// switches (plain / timestamped / header) re-format off the cached value
// and never re-fetch. Survives YouTube SPA navigation because the content
// script isn't reloaded; cleared on tab close, hard reload, or extension
// reload.
//
// Backing store is a Map: insertion order = LRU order. delete + set is the
// canonical move-to-MRU idiom; eviction takes the first (oldest) key. Both
// operations are O(1).

import type { Segment } from '../lib/types.js';

const MAX_ENTRIES = 10;

function cacheKey(videoId: string, languageCode: string): string {
  return `${videoId}::${languageCode}`;
}

let cache = new Map<string, Segment[]>();

export function getCachedTranscript(
  videoId: string,
  languageCode: string,
): Segment[] | null {
  const key = cacheKey(videoId, languageCode);
  const segments = cache.get(key);
  if (!segments) return null;
  // Promote to MRU.
  cache.delete(key);
  cache.set(key, segments);
  return segments;
}

export function setCachedTranscript(
  videoId: string,
  languageCode: string,
  segments: Segment[],
): void {
  const key = cacheKey(videoId, languageCode);
  if (cache.has(key)) cache.delete(key);
  cache.set(key, segments);
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

// Test-only reset. Not for production code paths.
export function _resetCacheForTest(): void {
  cache = new Map();
}
