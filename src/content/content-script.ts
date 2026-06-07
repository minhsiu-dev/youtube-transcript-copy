import type { CaptionTrack, FormatChoice, TabState, VideoMeta } from '../lib/types.js';
import type { Message } from '../lib/messages.js';
import { fetchCaptionTrack } from './transcript-fetcher.js';
import {
  PROBE_MESSAGE_TAG,
  PROBE_REQUEST_EVENT,
  type ProbeMessage,
} from './probe-protocol.js';
import {
  formatPlain,
  formatTimestamped,
  formatWithHeader,
} from '../lib/formatters.js';
import { ensurePot } from './pot-cache.js';

interface CachedPageData {
  tracks: CaptionTrack[];
  meta: VideoMeta | null;
  state: TabState;
}

function isWatchUrl(href: string): boolean {
  try {
    const u = new URL(href);
    return u.hostname.endsWith('youtube.com') && u.pathname === '/watch';
  } catch {
    return false;
  }
}

function classifyUrl(): TabState {
  return isWatchUrl(location.href) ? 'no-transcript' : 'not-youtube';
}

function currentVideoIdFromUrl(): string | null {
  if (!isWatchUrl(location.href)) return null;
  try {
    return new URL(location.href).searchParams.get('v');
  } catch {
    return null;
  }
}

let cache: CachedPageData = { tracks: [], meta: null, state: classifyUrl() };

function sendState(state: TabState): void {
  void chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state });
}

// If the cache's videoId doesn't match the current URL's v= param, ask the
// MAIN-world probe to re-fire and poll the cache until it catches up (or we
// time out). YouTube's SPA navigation can fire yt-navigate-finish before
// ytInitialPlayerResponse is updated; this self-heals at use-time so we
// never serve stale tracks/baseUrl to the popup.
async function refreshIfStale(): Promise<void> {
  const urlVid = currentVideoIdFromUrl();
  if (!urlVid) return;
  if (cache.meta?.videoId === urlVid) return;

  document.dispatchEvent(new CustomEvent(PROBE_REQUEST_EVENT));

  const deadline = Date.now() + 1500;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    if (cache.meta?.videoId === urlVid) return;
  }
}

function isProbeMessage(data: unknown): data is ProbeMessage {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    d['tag'] === PROBE_MESSAGE_TAG &&
    d['type'] === 'PROBE_RESULT' &&
    typeof d['result'] === 'object' &&
    d['result'] !== null
  );
}

window.addEventListener('message', (event: MessageEvent) => {
  // Only accept messages from this same window/origin (the probe runner).
  if (event.source !== window) return;
  if (event.origin !== location.origin) return;
  if (!isProbeMessage(event.data)) return;

  const result = event.data.result;
  if (!isWatchUrl(location.href)) {
    cache = { tracks: [], meta: null, state: 'not-youtube' };
    sendState('not-youtube');
    return;
  }
  if (!result.ok) {
    cache = { tracks: [], meta: null, state: 'no-transcript' };
    sendState('no-transcript');
    return;
  }
  // Reject probes whose videoId doesn't match the current URL. YouTube's SPA
  // navigation can fire events that cause the probe to run before
  // ytInitialPlayerResponse has been refreshed; rather than overwriting the
  // cache with stale data, drop the message and wait for the next probe.
  const urlVid = currentVideoIdFromUrl();
  if (urlVid && result.videoId !== urlVid) {
    return;
  }
  const tracks: CaptionTrack[] = result.captionTracks;
  const meta: VideoMeta = {
    videoId: result.videoId,
    title: result.title,
    url: result.url,
  };
  const state: TabState = tracks.length > 0 ? 'ready' : 'no-transcript';
  cache = { tracks, meta, state };
  sendState(state);
});

function findTrack(languageCode: string): CaptionTrack | undefined {
  return cache.tracks.find((t) => t.languageCode === languageCode);
}

function applyFormat(
  choice: FormatChoice,
  segments: Awaited<ReturnType<typeof fetchCaptionTrack>>,
  meta: VideoMeta | null,
): string {
  if (choice === 'plain') return formatPlain(segments);
  if (choice === 'timestamped') return formatTimestamped(segments);
  // choice === 'header'
  if (!meta) {
    throw new Error('Header format requested but no video metadata available');
  }
  return formatWithHeader(segments, meta);
}

chrome.runtime.onMessage.addListener(
  (msg: Message, _sender, sendResponse): boolean | undefined => {
    if (msg.type === 'GET_TRACKS') {
      (async () => {
        await refreshIfStale();
        sendResponse({
          type: 'GET_TRACKS_REPLY',
          tracks: cache.tracks,
          meta: cache.meta,
          state: cache.state,
        });
      })();
      return true; // keep channel open for async sendResponse
    }
    if (msg.type === 'FETCH_AND_FORMAT') {
      (async () => {
        await refreshIfStale();
        const track = findTrack(msg.languageCode);
        if (!track) {
          sendResponse({
            type: 'ERROR',
            reason: `No track for language ${msg.languageCode}`,
          });
          return;
        }
        const metaSnapshot = cache.meta;
        try {
          const potParams = metaSnapshot
            ? (await ensurePot(metaSnapshot.videoId)) ?? undefined
            : undefined;
          const segments = await fetchCaptionTrack(track.baseUrl, potParams);
          const text = applyFormat(msg.format, segments, metaSnapshot);
          sendResponse({ type: 'FETCH_AND_FORMAT_REPLY', text });
        } catch (err) {
          sendResponse({
            type: 'ERROR',
            reason: err instanceof Error ? err.message : String(err),
          });
        }
      })();
      return true; // keep channel open for async sendResponse
    }
    return false;
  },
);

// Send initial state immediately so the service worker can render the right
// icon even before the probe runner posts its first message.
sendState(cache.state);

// Handshake: tell the MAIN-world probe to re-emit its current result. This
// handles the cold-load race where MAIN runs at document_end and our listener
// here is registered at document_idle (so the initial postProbe() may have
// fired before we were listening).
document.dispatchEvent(new CustomEvent(PROBE_REQUEST_EVENT));
