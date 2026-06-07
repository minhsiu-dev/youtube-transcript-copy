import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseJson3, fetchCaptionTrack } from '../src/content/transcript-fetcher.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures/sample-json3.json'), 'utf8'),
);

describe('parseJson3', () => {
  it('parses events into Segment[] with seconds-based timing', () => {
    expect(parseJson3(FIXTURE)).toEqual([
      { start: 0, duration: 3.5, text: 'Hello world.' },
      { start: 3.5, duration: 4, text: 'This is a test.' },
      { start: 65, duration: 2, text: 'After one minute.' },
    ]);
  });

  it('skips events missing segs entirely', () => {
    const result = parseJson3({ events: [{ tStartMs: 0, dDurationMs: 1000 }] });
    expect(result).toEqual([]);
  });

  it('defaults start and duration to 0 when timing fields are absent', () => {
    const result = parseJson3({
      events: [{ segs: [{ utf8: 'No timing' }] }],
    });
    expect(result).toEqual([{ start: 0, duration: 0, text: 'No timing' }]);
  });

  it('skips events with only whitespace text', () => {
    const result = parseJson3({
      events: [
        { tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: '   ' }] },
        { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: '\n\n' }] },
      ],
    });
    expect(result).toEqual([]);
  });

  it('returns empty array when events is missing', () => {
    expect(parseJson3({})).toEqual([]);
  });

  it('joins multiple segs in a single event', () => {
    const result = parseJson3({
      events: [{ tStartMs: 0, dDurationMs: 1000, segs: [{ utf8: 'A' }, { utf8: 'B' }, { utf8: 'C' }] }],
    });
    expect(result).toEqual([{ start: 0, duration: 1, text: 'ABC' }]);
  });

  it('handles segs that lack utf8 field', () => {
    const result = parseJson3({
      events: [
        {
          tStartMs: 0,
          dDurationMs: 1000,
          segs: [{ utf8: 'Real' }, { acAsrConf: 0 }, { utf8: ' text' }],
        },
      ],
    });
    expect(result).toEqual([{ start: 0, duration: 1, text: 'Real text' }]);
  });
});

describe('fetchCaptionTrack', () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('sets fmt=json3 when missing and returns parsed Segments', async () => {
    let receivedUrl = '';
    globalThis.fetch = async (url) => {
      receivedUrl = url as string;
      return new Response(JSON.stringify(FIXTURE), {
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const segments = await fetchCaptionTrack(
      'https://www.youtube.com/api/timedtext?v=abc&lang=en',
    );

    expect(receivedUrl).toBe(
      'https://www.youtube.com/api/timedtext?v=abc&lang=en&fmt=json3',
    );
    expect(segments).toHaveLength(3);
    expect(segments[0]?.text).toBe('Hello world.');
  });

  it('keeps fmt=json3 if already present (no duplicate parameter)', async () => {
    let receivedUrl = '';
    globalThis.fetch = async (url) => {
      receivedUrl = url as string;
      return new Response(JSON.stringify(FIXTURE));
    };

    await fetchCaptionTrack(
      'https://www.youtube.com/api/timedtext?v=abc&fmt=json3',
    );

    expect(receivedUrl).toBe(
      'https://www.youtube.com/api/timedtext?v=abc&fmt=json3',
    );
  });

  it('replaces an existing non-json3 fmt parameter', async () => {
    let receivedUrl = '';
    globalThis.fetch = async (url) => {
      receivedUrl = url as string;
      return new Response(JSON.stringify(FIXTURE));
    };

    await fetchCaptionTrack(
      'https://www.youtube.com/api/timedtext?v=abc&fmt=srv3&lang=en',
    );

    expect(receivedUrl).toBe(
      'https://www.youtube.com/api/timedtext?v=abc&fmt=json3&lang=en',
    );
  });

  it('throws a descriptive error on HTTP failure', async () => {
    globalThis.fetch = async () =>
      new Response('not found', { status: 404, statusText: 'Not Found' });

    await expect(
      fetchCaptionTrack('https://www.youtube.com/api/timedtext?v=abc'),
    ).rejects.toThrow(/404/);
  });

  it('throws a clear error when the response body is empty', async () => {
    globalThis.fetch = async () => new Response('');

    await expect(
      fetchCaptionTrack('https://www.youtube.com/api/timedtext?v=abc'),
    ).rejects.toThrow(/empty body/);
  });

  it('throws a clear error when the response body is not JSON', async () => {
    globalThis.fetch = async () =>
      new Response('<html><body>nope</body></html>', {
        headers: { 'Content-Type': 'text/html' },
      });

    await expect(
      fetchCaptionTrack('https://www.youtube.com/api/timedtext?v=abc'),
    ).rejects.toThrow(/not JSON/);
  });
});
