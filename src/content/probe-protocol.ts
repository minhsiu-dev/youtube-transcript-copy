// Types and constants for the window.postMessage protocol used between
// the MAIN-world probe runner and the ISOLATED-world content script.
// Imported by both; values are inlined by esbuild bundling per entry.

export const PROBE_MESSAGE_TAG = '__yt_transcript_copier_v1__' as const;

export interface ProbeOk {
  ok: true;
  videoId: string;
  title: string;
  url: string;
  captionTracks: Array<{
    language: string;
    languageCode: string;
    baseUrl: string;
    isAuto: boolean;
  }>;
}

export interface ProbeFail {
  ok: false;
  reason: 'no-player-response' | 'no-video-id';
}

export type ProbeResult = ProbeOk | ProbeFail;

export interface ProbeMessage {
  tag: typeof PROBE_MESSAGE_TAG;
  type: 'PROBE_RESULT';
  result: ProbeResult;
}

// Event Task 6 (ISOLATED-world script) dispatches on document after
// registering its window.message listener, asking the MAIN-world probe
// to re-fire its initial result. This eliminates the document_end vs
// document_idle ordering race on cold page load.
export const PROBE_REQUEST_EVENT = '__yt_transcript_copier_request_probe__' as const;
