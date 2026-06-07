import {
  formatPlain,
  formatTimestamped,
  formatWithHeader,
} from '../src/lib/formatters.js';
import type { Segment, VideoMeta } from '../src/lib/types.js';

const SEGMENTS: Segment[] = [
  { start: 0, duration: 3.5, text: 'Hello world.' },
  { start: 3.5, duration: 4, text: 'This is a test.' },
  { start: 65, duration: 2, text: 'After one minute.' },
  { start: 3725.5, duration: 1, text: 'After one hour.' },
];

const META: VideoMeta = {
  videoId: 'abc123',
  title: 'Test Video',
  url: 'https://www.youtube.com/watch?v=abc123',
};

describe('formatPlain', () => {
  it('joins segment texts with single newlines', () => {
    expect(formatPlain(SEGMENTS)).toBe(
      'Hello world.\nThis is a test.\nAfter one minute.\nAfter one hour.',
    );
  });

  it('returns empty string for empty input', () => {
    expect(formatPlain([])).toBe('');
  });

  it('handles a single segment', () => {
    expect(formatPlain([{ start: 0, duration: 1, text: 'Solo.' }])).toBe('Solo.');
  });

  it('preserves embedded newlines in segment text', () => {
    expect(formatPlain([{ start: 0, duration: 1, text: 'Line A\nLine B' }])).toBe(
      'Line A\nLine B',
    );
  });
});

describe('formatTimestamped', () => {
  it('prefixes each line with [hh:mm:ss] for sub-hour segments', () => {
    expect(formatTimestamped([SEGMENTS[0]!, SEGMENTS[1]!])).toBe(
      '[00:00:00] Hello world.\n[00:00:03] This is a test.',
    );
  });

  it('formats minutes correctly', () => {
    expect(formatTimestamped([SEGMENTS[2]!])).toBe('[00:01:05] After one minute.');
  });

  it('formats hours correctly', () => {
    expect(formatTimestamped([SEGMENTS[3]!])).toBe('[01:02:05] After one hour.');
  });

  it('floors fractional seconds (no rounding)', () => {
    expect(
      formatTimestamped([{ start: 9.9, duration: 1, text: 'almost ten' }]),
    ).toBe('[00:00:09] almost ten');
  });

  it('returns empty string for empty input', () => {
    expect(formatTimestamped([])).toBe('');
  });
});

describe('formatWithHeader', () => {
  it('prepends the title and URL, then plain text', () => {
    expect(formatWithHeader([SEGMENTS[0]!, SEGMENTS[1]!], META)).toBe(
      'Test Video\nhttps://www.youtube.com/watch?v=abc123\n\nHello world.\nThis is a test.',
    );
  });

  it('still emits header when segments are empty', () => {
    expect(formatWithHeader([], META)).toBe(
      'Test Video\nhttps://www.youtube.com/watch?v=abc123\n\n',
    );
  });

  it('replaces embedded newlines in title and url with single spaces', () => {
    expect(
      formatWithHeader(
        [{ start: 0, duration: 1, text: 'Body.' }],
        {
          videoId: 'abc123',
          title: 'My\nMultiline\nTitle',
          url: 'https://example.com/\nbad',
        },
      ),
    ).toBe('My Multiline Title\nhttps://example.com/bad\n\nBody.');
  });
});
