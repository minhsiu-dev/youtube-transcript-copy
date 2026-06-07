import type { TabState } from '../lib/types.js';
import type { Message } from '../lib/messages.js';

// Use chrome.runtime.getURL() to resolve icon paths to absolute
// chrome-extension:// URLs. MV3 service workers fail intermittently to
// fetch icon bytes when given relative paths — the SW can be suspended
// mid-fetch, or path resolution may use the SW's URL as base instead of
// the extension root. Absolute URLs eliminate both ambiguities.
//
// Note: 'no-transcript' and 'not-youtube' intentionally share the same
// disabled icons — visually they're both "gray/inactive"; the popup text
// differentiates them.
function iconSet(suffix: '' | '-disabled'): chrome.action.TabIconDetails['path'] {
  return {
    '16': chrome.runtime.getURL(`icons/icon-16${suffix}.png`),
    '32': chrome.runtime.getURL(`icons/icon-32${suffix}.png`),
    '48': chrome.runtime.getURL(`icons/icon-48${suffix}.png`),
    '128': chrome.runtime.getURL(`icons/icon-128${suffix}.png`),
  };
}

const ICONS: Record<TabState, chrome.action.TabIconDetails['path']> = {
  ready: iconSet(''),
  'no-transcript': iconSet('-disabled'),
  'not-youtube': iconSet('-disabled'),
};

function applyIcon(tabId: number, state: TabState): void {
  void chrome.action.setIcon({ tabId, path: ICONS[state] });
}

chrome.runtime.onMessage.addListener(
  (msg: Message, sender, _sendResponse): boolean | undefined => {
    if (msg.type === 'STATE_UPDATE') {
      const tabId = sender.tab?.id;
      if (typeof tabId === 'number') {
        applyIcon(tabId, msg.state);
      }
    }
    return false;
  },
);
