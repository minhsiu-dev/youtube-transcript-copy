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

let cache: CachedPageData = { tracks: [], meta: null, state: classifyUrl() };

function sendState(state: TabState): void {
  void chrome.runtime.sendMessage({ type: 'STATE_UPDATE', state });
}

function isProbeMessage(data: unknown): data is ProbeMessage {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { tag?: unknown }).tag === PROBE_MESSAGE_TAG &&
    (data as { type?: unknown }).type === 'PROBE_RESULT'
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
): string {
  if (choice === 'plain') return formatPlain(segments);
  if (choice === 'timestamped') return formatTimestamped(segments);
  if (cache.meta) return formatWithHeader(segments, cache.meta);
  return formatPlain(segments);
}

chrome.runtime.onMessage.addListener(
  (msg: Message, _sender, sendResponse): boolean | undefined => {
    if (msg.type === 'GET_TRACKS') {
      sendResponse({
        type: 'GET_TRACKS_REPLY',
        tracks: cache.tracks,
        meta: cache.meta,
        state: cache.state,
      });
      return false;
    }
    if (msg.type === 'FETCH_AND_FORMAT') {
      (async () => {
        const track = findTrack(msg.languageCode);
        if (!track) {
          sendResponse({
            type: 'ERROR',
            reason: `No track for language ${msg.languageCode}`,
          });
          return;
        }
        try {
          const segments = await fetchCaptionTrack(track.baseUrl);
          const text = applyFormat(msg.format, segments);
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
