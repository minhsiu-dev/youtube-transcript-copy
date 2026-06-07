// In-memory pot cache + ensurePot helper.
//
// pot is YouTube's Proof-of-Origin Token, added by base.js to /api/timedtext
// requests and required by the server on many videos. We read it from the
// browser's Resource Timing buffer (performance.getEntriesByType('resource')),
// which records the full URL of every network resource the page has loaded.
//
// Strategy on each call:
//   1. In-memory cache hit (fresh, matching videoId) → return cached value
//   2. Passive scan — read existing resource-timings entries for any
//      /api/timedtext URL matching this videoId with pot+c set
//   3. Active trigger — clear buffer, click CC button twice (toggle on then
//      off), poll buffer up to 500ms for a fresh entry

export interface PotCapture {
  pot: string;
  c: string;
}

interface PotCacheEntry {
  pot: string;
  c: string;
  videoId: string;
  capturedAt: number;
}

const POT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const POT_TRIGGER_TIMEOUT_MS = 500;
const POT_POLL_INTERVAL_MS = 50;
const TIMEDTEXT_PREFIX = 'https://www.youtube.com/api/timedtext';

// CC button selectors, from most specific (matches a working third-party
// implementation) to a loose fallback. Try in order.
const CC_BUTTON_SELECTORS = [
  '#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-right-controls > button.ytp-subtitles-button.ytp-button',
  '#movie_player > div.ytp-chrome-bottom > div.ytp-chrome-controls > div.ytp-right-controls > div.ytp-right-controls-left > button.ytp-subtitles-button.ytp-button',
  '.ytp-subtitles-button',
];

// Single-slot cache by design: when the user navigates SPA-style to a new
// video, the previous video's entry is naturally invalidated by the
// videoId-equality check in readFreshCache. We don't need a Map.
let potCache: PotCacheEntry | null = null;

function setPotCache(entry: PotCacheEntry): void {
  potCache = entry;
}

function readFreshCache(videoId: string): PotCapture | null {
  if (!potCache) return null;
  if (potCache.videoId !== videoId) return null;
  if (Date.now() - potCache.capturedAt >= POT_TTL_MS) return null;
  return { pot: potCache.pot, c: potCache.c };
}

function findCcButton(): HTMLButtonElement | null {
  for (const sel of CC_BUTTON_SELECTORS) {
    const el = document.querySelector<HTMLButtonElement>(sel);
    if (el) return el;
  }
  return null;
}

// Scan the Resource Timing buffer for the most recent /api/timedtext entry
// matching `videoId` and containing both `pot` and `c` query params.
function scanResourceTimings(videoId: string): PotCapture | null {
  const entries = performance.getEntriesByType('resource');
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry) continue;
    const name = entry.name;
    if (!name.startsWith(TIMEDTEXT_PREFIX)) continue;
    let url: URL;
    try {
      url = new URL(name);
    } catch {
      continue;
    }
    if (url.searchParams.get('v') !== videoId) continue;
    const pot = url.searchParams.get('pot');
    const c = url.searchParams.get('c');
    if (!pot || !c) continue;
    return { pot, c };
  }
  return null;
}

// Relaxed variant of scanResourceTimings: returns the most-recent timedtext
// entry's pot+c without filtering by videoId. Used only by the content-script
// FETCH_AND_FORMAT handler during an ad, as a speculative fast path: when an
// ad is playing, YouTube's own timedtext fetches carry the ad's videoId, so
// the strict scan rejects them. The relaxed scan accepts whatever's there
// and lets the caller try it — if the server rejects (empty body), the caller
// falls back to waiting for the ad to end and running the strict path.
//
// IMPORTANT: callers MUST NOT write the result of this function to potCache.
// The pot is likely bound to the entry's videoId, not the caller's; caching
// it under the caller's videoId would poison subsequent strict-path lookups.
export function scanAnyPot(): PotCapture | null {
  const entries = performance.getEntriesByType('resource');
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (!entry) continue;
    const name = entry.name;
    if (!name.startsWith(TIMEDTEXT_PREFIX)) continue;
    let url: URL;
    try {
      url = new URL(name);
    } catch {
      continue;
    }
    const pot = url.searchParams.get('pot');
    const c = url.searchParams.get('c');
    if (!pot || !c) continue;
    return { pot, c };
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function ensurePot(videoId: string): Promise<PotCapture | null> {
  // 1. In-memory cache
  const cached = readFreshCache(videoId);
  if (cached) return cached;

  // 2. Passive scan
  const passive = scanResourceTimings(videoId);
  if (passive) {
    setPotCache({ ...passive, videoId, capturedAt: Date.now() });
    return passive;
  }

  // 3. Active trigger
  const button = findCcButton();
  if (!button) return null;

  // Match the click pattern of a known working third-party extension:
  // clear the resource-timings buffer, then click the CC button twice
  // synchronously (toggle on → toggle off). YouTube's click handler runs
  // synchronously on each click; the first click triggers the caption
  // fetch, the second restores the user's CC-off state. Inserting a delay
  // between the clicks was not part of the validated pattern.
  performance.clearResourceTimings();
  button.click();
  button.click();

  const deadline = Date.now() + POT_TRIGGER_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POT_POLL_INTERVAL_MS);
    const found = scanResourceTimings(videoId);
    if (found) {
      setPotCache({ ...found, videoId, capturedAt: Date.now() });
      return found;
    }
  }
  return null;
}

// Test-only reset. Not for production code paths.
export function _resetForTest(): void {
  potCache = null;
}
