import type { CaptionTrack, FormatChoice, TabState, VideoMeta } from '../lib/types.js';
import type { Message } from '../lib/messages.js';
import {
  fetchCaptionTrack,
  EmptyTranscriptError,
} from './transcript-fetcher.js';
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
import { ensurePot, scanAnyPot } from './pot-cache.js';
import { isAdPlaying, waitForAdToEnd } from './ad-state.js';

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

// Best-effort status push to the popup. The popup may be closed by the
// time we send (or may never have been open — service worker still listens
// for STATE_UPDATE but ignores STATUS_UPDATE). chrome.runtime.sendMessage
// rejects with "Receiving end does not exist" in that case; we swallow it
// because the fetch flow continues regardless.
function pushStatus(text: string): void {
  chrome.runtime.sendMessage({ type: 'STATUS_UPDATE', text }).catch(() => {
    /* popup not open — ignore */
  });
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
          // Step 1: speculative fast path during an ad, normal path otherwise.
          // During an ad, ensurePot's CC click would just trigger captions
          // for the ad's videoId and the strict scan would reject them, so
          // we use the relaxed scanAnyPot instead. It may or may not work;
          // if the server returns an empty body we fall through to Step 2.
          const adAtStart = isAdPlaying();
          const initialPot = adAtStart
            ? (scanAnyPot() ?? undefined)
            : metaSnapshot
              ? (await ensurePot(metaSnapshot.videoId)) ?? undefined
              : undefined;

          try {
            const segments = await fetchCaptionTrack(track.baseUrl, initialPot);
            const text = applyFormat(msg.format, segments, metaSnapshot);
            sendResponse({ type: 'FETCH_AND_FORMAT_REPLY', text });
            return;
          } catch (err) {
            // Only fall back when the error is specifically an empty body
            // AND there's still an ad on screen. Other errors (HTTP, parse)
            // bubble out unchanged.
            if (!(err instanceof EmptyTranscriptError) || !isAdPlaying()) {
              throw err;
            }
          }

          // Step 2: deterministic fallback — wait for the ad to end, then
          // run the normal strict pot path. waitForAdToEnd resolves true
          // when #movie_player has been ad-free for >300ms, or false on
          // timeout.
          pushStatus('Waiting for ad to end…');
          const ended = await waitForAdToEnd(60_000);
          if (!ended) {
            sendResponse({
              type: 'ERROR',
              reason: 'Ad is taking too long — try again after it ends.',
            });
            return;
          }

          const realPot = metaSnapshot
            ? (await ensurePot(metaSnapshot.videoId)) ?? undefined
            : undefined;
          const segments = await fetchCaptionTrack(track.baseUrl, realPot);
          const text = applyFormat(msg.format, segments, metaSnapshot);
          sendResponse({ type: 'FETCH_AND_FORMAT_REPLY', text });
        } catch (err) {
          // EmptyTranscriptError that survives Step 2 (e.g. video genuinely
          // has no captions, or ad ended into another non-captionable state)
          // gets the existing user-facing CC hint. Everything else surfaces
          // the underlying message.
          const reason =
            err instanceof EmptyTranscriptError
              ? "Couldn't load captions — please enable CC on this video and try again."
              : err instanceof Error
                ? err.message
                : String(err);
          sendResponse({ type: 'ERROR', reason });
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
