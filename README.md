# YT Transcript Copy

A Chrome extension (Manifest V3) that copies the transcript of the YouTube
video you're currently watching to your clipboard.

Extract / copy video transcripts (captions) for personal research & accessibility.

> ⚠ **Use responsibly.** You are responsible for complying with
> [YouTube's Terms of Service](https://www.youtube.com/t/terms) and
> applicable copyright law. This tool does not grant any rights to the
> content it accesses.

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

## License

[MIT](LICENSE) © 2026 Min Hsiu

## Disclaimer

This project is intended for personal research, accessibility, and similar
non-commercial uses where copying transcript text is consistent with
applicable law and platform terms.

You — the user — are solely responsible for ensuring your use complies with
[YouTube's Terms of Service](https://www.youtube.com/t/terms), copyright
law, and any other applicable rules in your jurisdiction. The MIT license
above grants permission to use the software; it does **not** grant any
rights to content accessed through it.

This project is not affiliated with, endorsed by, or sponsored by YouTube
or Google. "YouTube" is a trademark of Google LLC.

The software is provided "as is", without warranty of any kind. See the
[LICENSE](LICENSE) file for full terms.
