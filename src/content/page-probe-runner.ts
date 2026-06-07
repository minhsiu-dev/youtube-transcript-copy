// Runs in YouTube's MAIN world (declared in manifest content_scripts with
// "world": "MAIN"). Reads the current video's player response and forwards
// the result to the isolated content script via window.postMessage.
//
// Data source strategy:
//   The URL's `?v=` parameter is the only authoritative signal of which
//   video is currently active. YouTube's `window.ytInitialPlayerResponse`
//   global is set inline at initial page load but is NOT reliably refreshed
//   on SPA navigation. So we read from two sources:
//     1. The player's live API: `#movie_player.getPlayerResponse()` — this
//        always reflects the currently-loaded video after SPA nav.
//     2. `window.ytInitialPlayerResponse` — works on cold load before the
//        player element has fully initialised.
//   We pick whichever source matches the URL's videoId. If neither matches,
//   the isolated content script will reject the message and we'll re-probe
//   on the next signal.
//
// Trigger strategy:
//   We re-probe on three kinds of signals to maximise reliability:
//     1. yt-navigate-finish and yt-page-data-updated events
//     2. PROBE_REQUEST_EVENT from the isolated content script (handshake +
//        use-time refresh)
//     3. A 500ms polling loop on location.href — the ultimate fallback for
//        cases where YouTube's events don't fire for the navigation we care
//        about (e.g., some experiment paths).

import {
  PROBE_MESSAGE_TAG,
  PROBE_REQUEST_EVENT,
  type ProbeMessage,
  type ProbeOk,
  type ProbeResult,
} from './probe-protocol.js';

type CaptionTrackOut = ProbeOk['captionTracks'][number];

interface RawPlayerResponse {
  videoDetails?: { videoId?: string; title?: string };
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: unknown[];
    };
  };
}

function urlVideoId(): string | null {
  try {
    return new URL(location.href).searchParams.get('v');
  } catch {
    return null;
  }
}

function readSourceCandidates(): RawPlayerResponse[] {
  const out: RawPlayerResponse[] = [];
  // 1. Live player API — most up-to-date after SPA nav.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const player = document.querySelector('#movie_player') as any;
    if (player && typeof player.getPlayerResponse === 'function') {
      const r = player.getPlayerResponse();
      if (r && typeof r === 'object') out.push(r as RawPlayerResponse);
    }
  } catch {
    // ignore — player not ready or API removed
  }
  // 2. Initial page-load global — works before the player is fully built.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const initial = (window as any).ytInitialPlayerResponse;
  if (initial && typeof initial === 'object') {
    out.push(initial as RawPlayerResponse);
  }
  return out;
}

function extractTracks(r: RawPlayerResponse): CaptionTrackOut[] {
  const rawTracks = r.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!Array.isArray(rawTracks)) return [];
  return rawTracks
    .filter(
      (t): t is { baseUrl: string; languageCode: string } & Record<string, unknown> => {
        if (typeof t !== 'object' || t === null) return false;
        const obj = t as Record<string, unknown>;
        return typeof obj['baseUrl'] === 'string' && typeof obj['languageCode'] === 'string';
      },
    )
    .map((t): CaptionTrackOut => {
      const languageCode = t.languageCode;
      const name = t['name'] as
        | { simpleText?: string; runs?: Array<{ text: string }> }
        | undefined;
      const nameText =
        name?.simpleText ??
        name?.runs?.map((run) => run.text).join('') ??
        languageCode;
      return {
        language: nameText,
        languageCode,
        baseUrl: t.baseUrl,
        isAuto: t['kind'] === 'asr',
      };
    });
}

function buildProbeResult(): ProbeResult {
  const urlVid = urlVideoId();
  const candidates = readSourceCandidates();
  if (candidates.length === 0) {
    return { ok: false, reason: 'no-player-response' };
  }

  // Prefer a candidate whose videoId matches the URL.
  let chosen: RawPlayerResponse | null = null;
  if (urlVid) {
    for (const c of candidates) {
      if (c.videoDetails?.videoId === urlVid) {
        chosen = c;
        break;
      }
    }
  }
  // Fallback: take the first candidate even if its videoId doesn't match.
  // The isolated content script will reject it via its own videoId check.
  if (!chosen) chosen = candidates[0]!;

  const videoId = chosen.videoDetails?.videoId;
  if (!videoId) {
    return { ok: false, reason: 'no-video-id' };
  }

  return {
    ok: true,
    videoId,
    title: chosen.videoDetails?.title ?? '',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    captionTracks: extractTracks(chosen),
  };
}

function postProbe(): void {
  const message: ProbeMessage = {
    tag: PROBE_MESSAGE_TAG,
    type: 'PROBE_RESULT',
    result: buildProbeResult(),
  };
  window.postMessage(message, location.origin);
}

// Initial probe (page loaded directly to /watch).
postProbe();

// Signal source 1: YouTube's own SPA nav events. Fire at different points in
// the data-update lifecycle; listening to both maximises freshness.
document.addEventListener('yt-navigate-finish', () => {
  postProbe();
});
document.addEventListener('yt-page-data-updated', () => {
  postProbe();
});

// Signal source 2: handshake / use-time refresh from the ISOLATED content
// script.
document.addEventListener(PROBE_REQUEST_EVENT, () => {
  postProbe();
});

// Signal source 3: URL polling. This is the ultimate fallback — if YouTube's
// nav events don't fire (some experiment paths, some embed contexts), we
// detect navigation purely from location.href changing. The cost is one tiny
// string comparison every 500ms.
let lastUrl = location.href;
setInterval(() => {
  const now = location.href;
  if (now !== lastUrl) {
    lastUrl = now;
    postProbe();
  }
}, 500);
