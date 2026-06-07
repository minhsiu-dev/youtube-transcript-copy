/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  parseTimedTextXml,
  fetchCaptionTrack,
  buildTranscriptUrl,
  EmptyTranscriptError,
} from '../src/content/transcript-fetcher.js';

// jsdom's test env doesn't expose Node's Response global; build a minimal
// stand-in that supports the methods fetchCaptionTrack actually calls.
function mockResponse(
  body: string,
  init: { status?: number; statusText?: string } = {},
): Response {
  const status = init.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: init.statusText ?? 'OK',
    text: async () => body,
  } as unknown as Response;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_XML = readFileSync(
  path.join(__dirname, 'fixtures/sample-timedtext.xml'),
  'utf8',
);

describe('parseTimedTextXml', () => {
  it('parses <text> elements into Segments with seconds-based timing', () => {
    expect(parseTimedTextXml(FIXTURE_XML)).toEqual([
      { start: 0, duration: 2.8, text: 'Hi, thank you for watching the video.' },
      {
        start: 2.8,
        duration: 6.4,
        text: "So today I'm going to show you how to use YouTube Summary.",
      },
      {
        start: 9.2,
        duration: 4.48,
        text: 'So once you install the extension, you are ready to use it.',
      },
    ]);
  });

  it('returns empty array for empty transcript', () => {
    expect(
      parseTimedTextXml(
        '<?xml version="1.0" encoding="utf-8" ?><transcript></transcript>',
      ),
    ).toEqual([]);
  });

  it('skips text nodes with empty content', () => {
    const xml =
      '<transcript><text start="0" dur="1"></text><text start="1" dur="1">Real.</text></transcript>';
    expect(parseTimedTextXml(xml)).toEqual([
      { start: 1, duration: 1, text: 'Real.' },
    ]);
  });

  it('skips text nodes with only whitespace', () => {
    const xml = '<transcript><text start="0" dur="1">   </text></transcript>';
    expect(parseTimedTextXml(xml)).toEqual([]);
  });

  it('defaults start and duration to 0 when attrs are absent', () => {
    const xml = '<transcript><text>No attrs.</text></transcript>';
    expect(parseTimedTextXml(xml)).toEqual([
      { start: 0, duration: 0, text: 'No attrs.' },
    ]);
  });

  it('decodes double-encoded HTML entities (&amp;#39; -> apostrophe)', () => {
    const xml =
      '<transcript><text start="0" dur="1">It&amp;#39;s working.</text></transcript>';
    expect(parseTimedTextXml(xml)).toEqual([
      { start: 0, duration: 1, text: "It's working." },
    ]);
  });

  it('returns empty array on malformed XML', () => {
    expect(parseTimedTextXml('<not valid xml')).toEqual([]);
  });
});

describe('buildTranscriptUrl', () => {
  it('strips fmt parameter when present', () => {
    expect(
      buildTranscriptUrl(
        'https://www.youtube.com/api/timedtext?v=abc&fmt=json3&lang=en',
      ),
    ).toBe('https://www.youtube.com/api/timedtext?v=abc&lang=en');
  });

  it('leaves URLs without fmt unchanged', () => {
    expect(
      buildTranscriptUrl(
        'https://www.youtube.com/api/timedtext?v=abc&lang=en',
      ),
    ).toBe('https://www.youtube.com/api/timedtext?v=abc&lang=en');
  });

  it('strips fmt at the end of the query string', () => {
    expect(
      buildTranscriptUrl(
        'https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=srv3',
      ),
    ).toBe('https://www.youtube.com/api/timedtext?v=abc&lang=en');
  });
});

describe('fetchCaptionTrack', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('fetches without fmt and parses XML response', async () => {
    let receivedUrl = '';
    globalThis.fetch = async (url) => {
      receivedUrl = url as string;
      return mockResponse(FIXTURE_XML);
    };

    const segments = await fetchCaptionTrack(
      'https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=json3',
    );

    expect(receivedUrl).toBe(
      'https://www.youtube.com/api/timedtext?v=abc&lang=en',
    );
    expect(segments).toHaveLength(3);
    expect(segments[0]?.text).toBe('Hi, thank you for watching the video.');
  });

  it('throws a descriptive error on HTTP failure', async () => {
    globalThis.fetch = async () =>
      mockResponse('not found', { status: 404, statusText: 'Not Found' });

    await expect(
      fetchCaptionTrack('https://www.youtube.com/api/timedtext?v=abc'),
    ).rejects.toThrow(/404/);
  });

  it('throws EmptyTranscriptError when the response body is empty (no pot)', async () => {
    globalThis.fetch = async () => mockResponse('');

    await expect(
      fetchCaptionTrack('https://www.youtube.com/api/timedtext?v=abc'),
    ).rejects.toBeInstanceOf(EmptyTranscriptError);
  });

  it('throws HTTP error even when potParams is provided', async () => {
    globalThis.fetch = async () =>
      mockResponse('forbidden', { status: 403, statusText: 'Forbidden' });
    await expect(
      fetchCaptionTrack(
        'https://www.youtube.com/api/timedtext?v=abc',
        { pot: 'P', c: 'WEB' },
      ),
    ).rejects.toThrow(/403/);
  });

  it('throws when the response has no parseable segments', async () => {
    globalThis.fetch = async () =>
      mockResponse('<html><body>no transcript here</body></html>');

    await expect(
      fetchCaptionTrack('https://www.youtube.com/api/timedtext?v=abc'),
    ).rejects.toThrow(/no parseable segments/);
  });

  it('appends pot and c when potParams is provided', async () => {
    let receivedUrl = '';
    globalThis.fetch = async (url) => {
      receivedUrl = url as string;
      return mockResponse(FIXTURE_XML);
    };

    await fetchCaptionTrack(
      'https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=json3',
      { pot: 'POT_VALUE', c: 'WEB' },
    );

    const u = new URL(receivedUrl);
    expect(u.searchParams.get('pot')).toBe('POT_VALUE');
    expect(u.searchParams.get('c')).toBe('WEB');
    expect(u.searchParams.get('fmt')).toBeNull();
  });

  it('retries without pot when a pot-supplied fetch returns empty', async () => {
    const urls: string[] = [];
    let callCount = 0;
    globalThis.fetch = async (url) => {
      urls.push(url as string);
      callCount++;
      if (callCount === 1) return mockResponse('');
      return mockResponse(FIXTURE_XML);
    };

    const segments = await fetchCaptionTrack(
      'https://www.youtube.com/api/timedtext?v=abc&lang=en',
      { pot: 'POT_VALUE', c: 'WEB' },
    );

    expect(callCount).toBe(2);
    expect(new URL(urls[0]!).searchParams.get('pot')).toBe('POT_VALUE');
    expect(new URL(urls[1]!).searchParams.get('pot')).toBeNull();
    expect(segments).toHaveLength(3);
  });

  it('throws EmptyTranscriptError when both pot and no-pot attempts return empty', async () => {
    globalThis.fetch = async () => mockResponse('');

    await expect(
      fetchCaptionTrack(
        'https://www.youtube.com/api/timedtext?v=abc&lang=en',
        { pot: 'POT_VALUE', c: 'WEB' },
      ),
    ).rejects.toBeInstanceOf(EmptyTranscriptError);
  });
});
