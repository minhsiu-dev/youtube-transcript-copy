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
  reason: string;
}

export type ProbeResult = ProbeOk | ProbeFail;

export interface ProbeMessage {
  tag: typeof PROBE_MESSAGE_TAG;
  type: 'PROBE_RESULT';
  result: ProbeResult;
}
