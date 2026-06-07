/**
 * @jest-environment jsdom
 */
import { jest, beforeEach, describe, it, expect } from '@jest/globals';
import { ensurePot, _resetForTest } from '../src/content/pot-cache.js';
import type { PerformanceEntry } from 'perf_hooks';

// Build a minimal resource-timings entry. Only `name` (the URL) and `entryType`
// are read by ensurePot, but we set a few extras so the shape is realistic.
function resourceEntry(url: string): PerformanceEntry {
  return {
    name: url,
    entryType: 'resource',
    startTime: 0,
    duration: 0,
  } as unknown as PerformanceEntry;
}

function stubResourceEntries(entries: PerformanceEntry[]) {
  return jest
    .spyOn(performance, 'getEntriesByType')
    .mockImplementation((type: string) => (type === 'resource' ? entries : []));
}

beforeEach(() => {
  jest.restoreAllMocks();
  _resetForTest();
  document.body.innerHTML = '';
  // jsdom does not implement the Resource Timing API; install no-op stubs so
  // jest.spyOn can replace them per-test.
  if (typeof performance.getEntriesByType !== 'function') {
    (performance as unknown as Record<string, unknown>).getEntriesByType = () => [];
  }
  if (typeof performance.clearResourceTimings !== 'function') {
    (performance as unknown as Record<string, unknown>).clearResourceTimings = () => undefined;
  }
});

function installCcButton(): HTMLButtonElement {
  const movie = document.createElement('div');
  movie.id = 'movie_player';
  const bottom = document.createElement('div');
  bottom.className = 'ytp-chrome-bottom';
  const controls = document.createElement('div');
  controls.className = 'ytp-chrome-controls';
  const right = document.createElement('div');
  right.className = 'ytp-right-controls';
  const btn = document.createElement('button');
  btn.className = 'ytp-subtitles-button ytp-button';
  right.appendChild(btn);
  controls.appendChild(right);
  bottom.appendChild(controls);
  movie.appendChild(bottom);
  document.body.appendChild(movie);
  return btn;
}

const TIMEDTEXT_WITH_POT =
  'https://www.youtube.com/api/timedtext?v=vid_a&pot=P_VAL&c=WEB&lang=en';

describe('ensurePot', () => {
  it('returns null when no CC button is present and no passive entries exist', async () => {
    stubResourceEntries([]);
    const result = await ensurePot('vid_a');
    expect(result).toBeNull();
  });

  it('returns pot from passive resource-timings scan (no click)', async () => {
    stubResourceEntries([resourceEntry(TIMEDTEXT_WITH_POT)]);
    const btn = installCcButton();
    const clicks: number[] = [];
    btn.addEventListener('click', () => clicks.push(Date.now()));

    const result = await ensurePot('vid_a');
    expect(result).toEqual({ pot: 'P_VAL', c: 'WEB' });
    expect(clicks).toHaveLength(0);
  });

  it('ignores resource entries for a different videoId', async () => {
    stubResourceEntries([
      resourceEntry(
        'https://www.youtube.com/api/timedtext?v=other_vid&pot=X&c=WEB',
      ),
    ]);
    // No CC button — should return null instead of using the wrong-video entry
    const result = await ensurePot('vid_a');
    expect(result).toBeNull();
  });

  it('returns cached value on second call (no second click, no rescan)', async () => {
    stubResourceEntries([resourceEntry(TIMEDTEXT_WITH_POT)]);
    const btn = installCcButton();
    const clicks: number[] = [];
    btn.addEventListener('click', () => clicks.push(Date.now()));

    const first = await ensurePot('vid_a');
    expect(first).toEqual({ pot: 'P_VAL', c: 'WEB' });

    // Subsequent call: even if we wipe the buffer and remove the button, the
    // cache should still serve.
    jest.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    document.body.innerHTML = '';

    const second = await ensurePot('vid_a');
    expect(second).toEqual({ pot: 'P_VAL', c: 'WEB' });
    expect(clicks).toHaveLength(0);
  });

  it('clicks CC twice and reads a freshly-arrived entry', async () => {
    // Start with no passive entries; the active trigger will populate them.
    const entriesRef: PerformanceEntry[] = [];
    jest
      .spyOn(performance, 'getEntriesByType')
      .mockImplementation((type: string) =>
        type === 'resource' ? entriesRef.slice() : [],
      );
    const clearSpy = jest
      .spyOn(performance, 'clearResourceTimings')
      .mockImplementation(() => {
        entriesRef.length = 0;
      });

    const btn = installCcButton();
    const clicks: number[] = [];
    btn.addEventListener('click', () => {
      clicks.push(Date.now());
      // On the first click, simulate YouTube's caption fetch landing
      // in the resource-timings buffer ~30ms later.
      if (clicks.length === 1) {
        setTimeout(() => {
          entriesRef.push(resourceEntry(TIMEDTEXT_WITH_POT));
        }, 30);
      }
    });

    const result = await ensurePot('vid_a');
    expect(result).toEqual({ pot: 'P_VAL', c: 'WEB' });
    expect(clicks).toHaveLength(2);
    expect(clearSpy).toHaveBeenCalled();
  });

  it('returns null after the active-trigger timeout if no entry arrives', async () => {
    stubResourceEntries([]);
    jest.spyOn(performance, 'clearResourceTimings').mockImplementation(() => {});
    installCcButton();
    const result = await ensurePot('vid_a');
    expect(result).toBeNull();
  }, 3000);

  it('ignores entries that lack pot or c', async () => {
    stubResourceEntries([
      resourceEntry(
        'https://www.youtube.com/api/timedtext?v=vid_a&lang=en', // no pot, no c
      ),
    ]);
    // No CC button — passive scan should reject the incomplete entry and we
    // fall through to null.
    const result = await ensurePot('vid_a');
    expect(result).toBeNull();
  });
});
