import type { CaptionTrack, FormatChoice, VideoMeta, TabState } from '../lib/types.js';
import type { Message } from '../lib/messages.js';

const langSelect = document.getElementById('lang') as HTMLSelectElement;
const status = document.getElementById('status') as HTMLDivElement;
const btnPlain = document.getElementById('btn-plain') as HTMLButtonElement;
const btnTimestamped = document.getElementById('btn-timestamped') as HTMLButtonElement;
const btnHeader = document.getElementById('btn-header') as HTMLButtonElement;

let activeTabId: number | null = null;

function setStatus(text: string, kind: 'success' | 'error' | 'info' = 'info'): void {
  status.textContent = text;
  status.classList.remove('success', 'error');
  if (kind === 'success') status.classList.add('success');
  if (kind === 'error') status.classList.add('error');
}

function setButtonsEnabled(enabled: boolean): void {
  btnPlain.disabled = !enabled;
  btnTimestamped.disabled = !enabled;
  btnHeader.disabled = !enabled;
}

async function getActiveTabId(): Promise<number | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id ?? null;
}

async function ask<T>(tabId: number, msg: Message): Promise<T> {
  return (await chrome.tabs.sendMessage(tabId, msg)) as T;
}

interface GetTracksReply {
  type: 'GET_TRACKS_REPLY';
  tracks: CaptionTrack[];
  meta: VideoMeta | null;
  state: TabState;
}

function pickDefaultIndex(tracks: CaptionTrack[]): number {
  const firstNonAuto = tracks.findIndex((t) => !t.isAuto);
  return firstNonAuto >= 0 ? firstNonAuto : 0;
}

async function init(): Promise<void> {
  setButtonsEnabled(false);
  activeTabId = await getActiveTabId();
  if (activeTabId === null) {
    setStatus('No active tab.', 'error');
    return;
  }

  let reply: GetTracksReply | undefined;
  try {
    reply = await ask<GetTracksReply>(activeTabId, { type: 'GET_TRACKS' });
  } catch {
    setStatus('Open a YouTube video to use this.', 'info');
    return;
  }

  if (!reply || reply.state === 'not-youtube') {
    setStatus('Open a YouTube video to use this.', 'info');
    return;
  }
  if (reply.state === 'no-transcript' || reply.tracks.length === 0) {
    setStatus('This video has no transcript.', 'info');
    return;
  }

  // Populate language dropdown.
  langSelect.replaceChildren();
  reply.tracks.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.languageCode;
    opt.textContent = t.isAuto ? `${t.language} (auto)` : t.language;
    langSelect.appendChild(opt);
  });
  langSelect.selectedIndex = pickDefaultIndex(reply.tracks);

  setButtonsEnabled(true);
  setStatus('');
}

async function copyWithFormat(format: FormatChoice): Promise<void> {
  setButtonsEnabled(false);
  setStatus('Fetching…', 'info');
  if (activeTabId === null) {
    setStatus('No active tab.', 'error');
    setButtonsEnabled(true);
    return;
  }
  try {
    const reply = (await ask<
      | { type: 'FETCH_AND_FORMAT_REPLY'; text: string }
      | { type: 'ERROR'; reason: string }
    >(activeTabId, {
      type: 'FETCH_AND_FORMAT',
      languageCode: langSelect.value,
      format,
    })) ?? { type: 'ERROR', reason: 'No response from page.' };

    if (reply.type === 'ERROR') {
      setStatus(`Failed: ${reply.reason}`, 'error');
      setButtonsEnabled(true);
      return;
    }

    try {
      await navigator.clipboard.writeText(reply.text);
    } catch (err) {
      setStatus(`Clipboard write failed: ${String(err)}`, 'error');
      setButtonsEnabled(true);
      return;
    }
    setStatus('Copied!', 'success');
    setTimeout(() => window.close(), 600);
  } catch (err) {
    setStatus(`Failed: ${String(err)}`, 'error');
    setButtonsEnabled(true);
  }
}

btnPlain.addEventListener('click', () => void copyWithFormat('plain'));
btnTimestamped.addEventListener('click', () => void copyWithFormat('timestamped'));
btnHeader.addEventListener('click', () => void copyWithFormat('header'));

void init();
