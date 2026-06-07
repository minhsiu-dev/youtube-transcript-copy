export interface Segment {
  start: number; // seconds, float
  duration: number; // seconds, float
  text: string;
}

export interface CaptionTrack {
  language: string; // human-readable, e.g. "English"
  languageCode: string; // e.g. "en", "en-US"
  baseUrl: string;
  isAuto: boolean; // true if YouTube marked it kind === "asr"
}

export interface VideoMeta {
  videoId: string;
  title: string;
  url: string; // canonical https://www.youtube.com/watch?v=...
}

export type FormatChoice = 'plain' | 'timestamped' | 'header';

export type TabState = 'ready' | 'no-transcript' | 'not-youtube';
