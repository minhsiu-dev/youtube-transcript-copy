// Runs in YouTube's MAIN world (declared in manifest content_scripts with
// "world": "MAIN"). Reads window.ytInitialPlayerResponse and forwards the
// result to the isolated content script via window.postMessage.

import {
  PROBE_MESSAGE_TAG,
  PROBE_REQUEST_EVENT,
  type ProbeMessage,
  type ProbeOk,
  type ProbeResult,
} from './probe-protocol.js';

type CaptionTrackOut = ProbeOk['captionTracks'][number];

function buildProbeResult(): ProbeResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  const r = w.ytInitialPlayerResponse;
  if (!r || typeof r !== 'object') {
    return { ok: false, reason: 'no-player-response' };
  }
  const videoId: string | undefined = r.videoDetails?.videoId;
  const title: string | undefined = r.videoDetails?.title;
  if (!videoId) {
    return { ok: false, reason: 'no-video-id' };
  }
  const rawTracks = r.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  const captionTracks: CaptionTrackOut[] = Array.isArray(rawTracks)
    ? rawTracks
        .filter(
          (t: { baseUrl?: unknown; languageCode?: unknown }) =>
            typeof t.baseUrl === 'string' && typeof t.languageCode === 'string',
        )
        .map(
          (t: {
            languageCode: string;
            name?: { simpleText?: string; runs?: Array<{ text: string }> };
            kind?: string;
            baseUrl: string;
          }): CaptionTrackOut => {
            const languageCode = t.languageCode;
            const nameText =
              t.name?.simpleText ??
              t.name?.runs?.map((run) => run.text).join('') ??
              languageCode;
            return {
              language: nameText,
              languageCode,
              baseUrl: t.baseUrl,
              isAuto: t.kind === 'asr',
            };
          },
        )
    : [];
  return {
    ok: true,
    videoId,
    title: title ?? '',
    url: `https://www.youtube.com/watch?v=${videoId}`,
    captionTracks,
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

// SPA navigation: YouTube fires yt-navigate-finish when an in-app nav completes.
document.addEventListener('yt-navigate-finish', () => {
  postProbe();
});

// Handshake: the ISOLATED-world content script may register its window.message
// listener AFTER our initial postProbe() (document_end vs document_idle race).
// On hearing this request event, re-emit the current probe result.
document.addEventListener(PROBE_REQUEST_EVENT, () => {
  postProbe();
});
