import type { CaptionTrack, FormatChoice, TabState, VideoMeta } from './types.js';

export type Message =
  | { type: 'STATE_UPDATE'; state: TabState }
  | { type: 'STATUS_UPDATE'; text: string }
  | { type: 'GET_TRACKS' }
  | {
      type: 'GET_TRACKS_REPLY';
      tracks: CaptionTrack[];
      meta: VideoMeta | null;
      state: TabState;
    }
  | { type: 'FETCH_AND_FORMAT'; languageCode: string; format: FormatChoice }
  | { type: 'FETCH_AND_FORMAT_REPLY'; text: string }
  | { type: 'ERROR'; reason: string };

export const MSG = {
  STATE_UPDATE: 'STATE_UPDATE',
  STATUS_UPDATE: 'STATUS_UPDATE',
  GET_TRACKS: 'GET_TRACKS',
  GET_TRACKS_REPLY: 'GET_TRACKS_REPLY',
  FETCH_AND_FORMAT: 'FETCH_AND_FORMAT',
  FETCH_AND_FORMAT_REPLY: 'FETCH_AND_FORMAT_REPLY',
  ERROR: 'ERROR',
} as const;
