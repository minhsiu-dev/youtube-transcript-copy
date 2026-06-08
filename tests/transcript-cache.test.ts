/** @jest-environment node */
import { beforeEach, describe, it, expect } from '@jest/globals';
import {
  getCachedTranscript,
  setCachedTranscript,
  _resetCacheForTest,
} from '../src/content/transcript-cache.js';
import type { Segment } from '../src/lib/types.js';

function mkSegments(label: string): Segment[] {
  return [{ start: 0, duration: 1, text: label }];
}

beforeEach(() => {
  _resetCacheForTest();
});

describe('transcript-cache', () => {
  it('returns null for an absent key', () => {
    expect(getCachedTranscript('vid', 'en')).toBeNull();
  });

  it('round-trips a set then get', () => {
    const segs = mkSegments('hi');
    setCachedTranscript('vid', 'en', segs);
    expect(getCachedTranscript('vid', 'en')).toBe(segs);
  });

  it('stores different languageCodes independently for the same videoId', () => {
    const en = mkSegments('en');
    const ja = mkSegments('ja');
    setCachedTranscript('vid', 'en', en);
    setCachedTranscript('vid', 'ja', ja);
    expect(getCachedTranscript('vid', 'en')).toBe(en);
    expect(getCachedTranscript('vid', 'ja')).toBe(ja);
  });

  it('evicts the oldest entry when an 11th is inserted', () => {
    for (let i = 0; i < 10; i++) {
      setCachedTranscript(`v${i}`, 'en', mkSegments(`v${i}`));
    }
    setCachedTranscript('v10', 'en', mkSegments('v10'));
    expect(getCachedTranscript('v0', 'en')).toBeNull();
    expect(getCachedTranscript('v1', 'en')).not.toBeNull();
    expect(getCachedTranscript('v10', 'en')).not.toBeNull();
  });

  it('promotes an entry to MRU on get; next eviction skips it', () => {
    for (let i = 0; i < 10; i++) {
      setCachedTranscript(`v${i}`, 'en', mkSegments(`v${i}`));
    }
    // Read v0 — should move it to MRU.
    expect(getCachedTranscript('v0', 'en')).not.toBeNull();
    // Insert v10 — eviction should drop v1 (the new oldest), not v0.
    setCachedTranscript('v10', 'en', mkSegments('v10'));
    expect(getCachedTranscript('v0', 'en')).not.toBeNull();
    expect(getCachedTranscript('v1', 'en')).toBeNull();
  });

  it('re-setting an existing key updates the value and promotes to MRU', () => {
    for (let i = 0; i < 10; i++) {
      setCachedTranscript(`v${i}`, 'en', mkSegments(`v${i}`));
    }
    // Re-set v0 with a new value — should promote to MRU and replace.
    const replacement = mkSegments('v0-new');
    setCachedTranscript('v0', 'en', replacement);
    expect(getCachedTranscript('v0', 'en')).toBe(replacement);
    // Insert v10 — eviction should drop v1 (now oldest), not v0.
    setCachedTranscript('v10', 'en', mkSegments('v10'));
    expect(getCachedTranscript('v0', 'en')).toBe(replacement);
    expect(getCachedTranscript('v1', 'en')).toBeNull();
  });
});
