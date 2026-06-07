# YT Transcript Copier

A Chrome extension (Manifest V3) that copies the transcript of the YouTube
video you're currently watching to your clipboard.

## Features

- One-click copy from the toolbar icon
- Three output formats: plain text, with timestamps, plain + title/URL
- Multi-language: defaults to the original-language transcript, switchable
  to any available language (including auto-translated)
- Icon reflects state: red when a transcript is available, gray otherwise

## Install (development)

```bash
npm install
npm run icons   # one-time: generate icon PNGs
npm run build
```

Then in Chrome:

1. Visit `chrome://extensions`
2. Toggle **Developer mode** (top-right)
3. Click **Load unpacked** and choose the `dist/` folder

For iterative development, run `npm run watch` and reload the extension
from `chrome://extensions` after each change.

## Scripts

| Command | Description |
| --- | --- |
| `npm run build` | One-shot build into `dist/` |
| `npm run watch` | Rebuild on source change |
| `npm test` | Run unit tests (Jest) |
| `npm run typecheck` | Run `tsc --noEmit` |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |
| `npm run icons` | Regenerate icon PNGs |

## How it works

YouTube embeds caption metadata (language list + URLs) in
`window.ytInitialPlayerResponse`. This extension reads it via a tiny page-world
probe, then fetches `${baseUrl}&fmt=json3` for the chosen language to retrieve
structured caption data. The popup formats the data and writes to the clipboard.

See `docs/superpowers/specs/2026-06-07-yt-transcript-copier-design.md` for the
full design.

## Manual end-to-end test checklist

Use this before tagging a release.

- [ ] Load unpacked extension in `chrome://extensions`
- [ ] Open a video with English transcript (e.g. `https://www.youtube.com/watch?v=jNQXAC9IVRw`)
      → icon turns red
- [ ] Click the icon → popup opens with language dropdown + three format buttons
- [ ] Click each format button on the same video, paste into a text editor,
      and confirm the output matches the expected format:
  - Plain text: lines of caption text, no timestamps
  - With timestamps: each line prefixed with `[hh:mm:ss]`
  - Plain + title/URL: title and URL on first two lines, blank line, then plain text
- [ ] Switch the language dropdown to a different language (auto-translated)
      and confirm the copied content is in that language
- [ ] Open a video that has no transcript (uncommon — most public videos have
      at least auto-captions). Icon stays gray; popup shows "This video has
      no transcript."
- [ ] Open the YouTube homepage or a channel page → icon is gray; popup shows
      "Open a YouTube video to use this."
- [ ] From a transcript-having video, click into another transcript-having
      video (in-page link, no full reload) → icon and popup reflect the new
      video without needing a manual refresh
- [ ] Refresh a video page mid-session → popup still works correctly afterward

## License

(Add your preferred license here.)
