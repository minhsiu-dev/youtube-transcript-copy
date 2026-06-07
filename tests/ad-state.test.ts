/**
 * @jest-environment jsdom
 */
import { beforeEach, describe, it, expect } from '@jest/globals';
import { isAdPlaying, waitForAdToEnd } from '../src/content/ad-state.js';

function installPlayer(classes: string[] = []): HTMLDivElement {
  const player = document.createElement('div');
  player.id = 'movie_player';
  for (const c of classes) player.classList.add(c);
  document.body.appendChild(player);
  return player;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('isAdPlaying', () => {
  it('returns false when #movie_player is absent', () => {
    expect(isAdPlaying()).toBe(false);
  });

  it('returns false when #movie_player has no ad classes', () => {
    installPlayer();
    expect(isAdPlaying()).toBe(false);
  });

  it('returns true when #movie_player has ad-showing', () => {
    installPlayer(['ad-showing']);
    expect(isAdPlaying()).toBe(true);
  });

  it('returns true when #movie_player has ad-interrupting', () => {
    installPlayer(['ad-interrupting']);
    expect(isAdPlaying()).toBe(true);
  });

  it('returns true when both ad classes are present', () => {
    installPlayer(['ad-showing', 'ad-interrupting']);
    expect(isAdPlaying()).toBe(true);
  });
});

describe('waitForAdToEnd', () => {
  it('resolves true immediately when player is absent', async () => {
    await expect(waitForAdToEnd(1000)).resolves.toBe(true);
  });

  it('resolves true immediately when no ad class is present', async () => {
    installPlayer();
    await expect(waitForAdToEnd(1000)).resolves.toBe(true);
  });

  it('resolves true after the ad class is removed and the debounce passes', async () => {
    const player = installPlayer(['ad-showing']);
    const promise = waitForAdToEnd(2000);
    setTimeout(() => player.classList.remove('ad-showing'), 50);
    await expect(promise).resolves.toBe(true);
  }, 3000);

  it('does not resolve early if ad class re-appears within the debounce window', async () => {
    const player = installPlayer(['ad-showing']);
    // Timeout 500ms, debounce is 300ms internally.
    // Remove ad at t=50, re-add at t=150 (within debounce → cancel),
    // never remove again → must time out and resolve false.
    const promise = waitForAdToEnd(500);
    setTimeout(() => player.classList.remove('ad-showing'), 50);
    setTimeout(() => player.classList.add('ad-showing'), 150);
    await expect(promise).resolves.toBe(false);
  }, 2000);

  it('resolves false on timeout when the ad never ends', async () => {
    installPlayer(['ad-showing']);
    await expect(waitForAdToEnd(200)).resolves.toBe(false);
  }, 1500);
});
