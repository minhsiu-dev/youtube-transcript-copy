import type { TabState } from '../lib/types.js';
import type { Message } from '../lib/messages.js';

// Note: 'no-transcript' and 'not-youtube' intentionally share the same
// disabled icons — visually they're both "gray/inactive"; the popup text
// differentiates them.
const ICONS: Record<TabState, chrome.action.TabIconDetails['path']> = {
  ready: {
    '16': 'icons/icon-16.png',
    '32': 'icons/icon-32.png',
    '48': 'icons/icon-48.png',
    '128': 'icons/icon-128.png',
  },
  'no-transcript': {
    '16': 'icons/icon-16-disabled.png',
    '32': 'icons/icon-32-disabled.png',
    '48': 'icons/icon-48-disabled.png',
    '128': 'icons/icon-128-disabled.png',
  },
  'not-youtube': {
    '16': 'icons/icon-16-disabled.png',
    '32': 'icons/icon-32-disabled.png',
    '48': 'icons/icon-48-disabled.png',
    '128': 'icons/icon-128-disabled.png',
  },
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
