// Ad-state detection helpers. YouTube marks the player element with
// `ad-showing` while an ad is rendering and `ad-interrupting` during the
// transition into or out of an ad. Either class means "an ad is on screen
// and the underlying video's caption fetch will be blocked or wrong".
//
// `waitForAdToEnd` returns a Promise that resolves true once the player has
// been ad-free for >300ms (debounced against the flicker that happens when
// YouTube transitions between back-to-back ads), or false on timeout. The
// debounce is internal and not configurable; the timeout is.

const AD_CLASSES = ['ad-showing', 'ad-interrupting'] as const;
const DEBOUNCE_MS = 300;

export function isAdPlaying(): boolean {
  const player = document.querySelector('#movie_player');
  if (!player) return false;
  return AD_CLASSES.some((c) => player.classList.contains(c));
}

export function waitForAdToEnd(timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const player = document.querySelector('#movie_player');

    // No player element — nothing to wait for.
    if (!player) {
      resolve(true);
      return;
    }

    // Already ad-free at call time — resolve immediately, no observer.
    if (!isAdPlaying()) {
      resolve(true);
      return;
    }

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;
    let observer: MutationObserver | null = null;
    let resolved = false;

    function done(result: boolean): void {
      if (resolved) return;
      resolved = true;
      if (observer) observer.disconnect();
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      if (timeoutTimer !== null) clearTimeout(timeoutTimer);
      resolve(result);
    }

    observer = new MutationObserver(() => {
      if (!isAdPlaying()) {
        // Ad gone — arm debounce (idempotent: don't restart if already armed).
        if (debounceTimer === null) {
          debounceTimer = setTimeout(() => {
            debounceTimer = null;
            done(true);
          }, DEBOUNCE_MS);
        }
      } else {
        // Ad returned within the debounce window — cancel pending resolve.
        if (debounceTimer !== null) {
          clearTimeout(debounceTimer);
          debounceTimer = null;
        }
      }
    });

    observer.observe(player, { attributes: true, attributeFilter: ['class'] });

    timeoutTimer = setTimeout(() => done(false), timeoutMs);
  });
}
