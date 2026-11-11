# Voxtab

**Say it. Your tab opens.**

Voxtab is a voice-controlled browser launcher. Tap the microphone, say something like
*"open YouTube"* or *"search lo-fi beats on YouTube"*, and Voxtab understands the sentence
and opens the right page in a new browser tab. No typing, no hunting through bookmarks.

It is a small, dependency-free web app: plain HTML, CSS and JavaScript on top of the
browser's built-in speech recognition. There is no backend, no account and no build step.

---

## What it does

- **Opens websites by voice.** "Open GitHub", "go to wikipedia.org", "launch Spotify".
- **Searches inside sites.** "Search for lo-fi beats on YouTube", "find coffee shops near me on Google Maps", "play Daft Punk".
- **Opens several tabs in one sentence.** "Open GitHub and Reddit" (capped at 5 tabs per command).
- **Closes tabs it opened.** "Close the last tab", "close all tabs".
- **Understands natural speech.** Filler such as *"please"*, *"can you"* or *"hey Voxtab"* is ignored, and speech-engine quirks like "you tube" or "example dot com" are handled.
- **Learns your own phrases.** Create shortcuts such as *"my docs"* → `https://docs.example.com`.
- **Works without a microphone.** Every command can also be typed, and every phrase in the UI is clickable.

### Interface

- Live microphone visualizer around the mic button, driven by the real audio level.
- Live transcript while you speak, then a result card showing exactly what was opened.
- Dark and light themes (follows your system, switchable), keyboard shortcuts (`Space` to talk, `Esc` to stop, `/` to type) and a layout that works on phones.
- Optional settings: spoken replies, *ask before opening*, hands-free *keep listening*, and ten recognition languages.

---

## Quick start

You need [Node.js](https://nodejs.org/) 20 or newer (only to serve the files locally).

```bash
npm start
```

Then open <http://localhost:5173> in **Chrome, Edge or Safari** and tap the mic.

Use another port with `PORT=8080 npm start`.

> **Why a local server?** Browsers only allow microphone access on secure origins.
> `http://localhost` counts as secure; opening `index.html` straight from disk (`file://`) does not.

The app is just static files, so it also runs on any static host (GitHub Pages, Netlify, Cloudflare Pages, ...) as long as it is served over HTTPS.

### Allow pop-ups (important)

Browsers only open new tabs from a user click. A tab opened right after you *speak* can be
treated as a pop-up and blocked. If that happens, Voxtab shows what it understood with
**Open** buttons you can click, and the browser usually shows a "pop-up blocked" icon in the
address bar. Choose **Always allow pop-ups from this site** once, and voice commands will
open tabs directly.

---

## What you can say

| Goal | Examples |
| --- | --- |
| Open a site | "Open YouTube" · "Go to GitHub" · "Launch Spotify" · "Open a new tab with Netflix" |
| Open a web address | "Go to wikipedia.org" · "Open example dot com" |
| Open several | "Open GitHub and Reddit" · "Open YouTube, Google and Gmail" |
| Search a site | "Search for lo-fi beats on YouTube" · "Find coffee shops near me on Google Maps" · "Open YouTube and search cute cats" |
| Quick search | "Google how to center a div" · "Search for best pizza in Rome" |
| Play / watch | "Play Daft Punk" · "Watch cooking videos" (both search YouTube) |
| Your shortcuts | "Open my docs" |
| Manage tabs | "Close the last tab" · "Close all tabs" |
| Help | "What can I say" |

Voxtab knows 30+ sites (YouTube, Google and its apps, GitHub, Stack Overflow, MDN, npm,
Wikipedia, Reddit, X, LinkedIn, Spotify, Netflix, Twitch, Amazon, Tokopedia, Notion, Figma,
Claude, ChatGPT, and more). If a name is not recognized, Voxtab offers to search Google for it
instead of guessing.

Indonesian verbs such as *"buka"* work too when the recognition language is set to Bahasa Indonesia.

---

## How it works

```
 microphone ──▶ speech.js ──▶ commands.js ──▶ app.js ──▶ new browser tabs
                (Web Speech     (parser:        (UI, tab
                 API: audio      text → intent   opening,
                 → text)         + URLs)         history)
```

1. **`speech.js`** wraps the browser's `SpeechRecognition` API and returns several alternative transcripts for each utterance.
2. **`commands.js`** is a pure, unit-tested parser. It normalizes the text, strips filler, detects the intent (open / search / close / help) and builds the final URLs. The first alternative that makes sense as a command wins.
3. **`app.js`** opens the tabs with `window.open`, detects pop-up blocking, renders the result card, and stores history, shortcuts and settings in `localStorage`.
4. **`visualizer.js`** draws the audio-reactive ring from a Web Audio `AnalyserNode`.

### Project structure

```
index.html                 App shell (semantic HTML, no inline scripts or styles)
assets/
  css/styles.css           Design tokens, themes, layout, animations
  js/
    app.js                 UI wiring and tab opening
    commands.js            Voice command parser (pure, tested)
    sites.js               Site catalog: names, aliases, home and search URLs
    speech.js              Speech recognition / synthesis wrapper
    visualizer.js          Microphone-reactive canvas visualizer
    storage.js             Defensive localStorage wrapper
    theme-init.js          Applies the saved theme before first paint
  favicon.svg
scripts/serve.mjs          Zero-dependency local static server
tests/                     Node test suite (parser + server)
```

### Add a site

Append an entry to `SITES` in [`assets/js/sites.js`](assets/js/sites.js). Use `{q}` as the search placeholder, or `search: null` for open-only sites:

```js
{ id: 'hn', name: 'Hacker News', aliases: ['hacker news', 'hn'], color: '#ff6600',
  home: 'https://news.ycombinator.com', search: 'https://hn.algolia.com/?q={q}' },
```

The site automatically appears in the UI and in the voice grammar.

---

## Browser support

| Browser | Voice | Typed commands |
| --- | --- | --- |
| Chrome / Edge (desktop and Android) | Yes | Yes |
| Safari (macOS / iOS) | Yes | Yes |
| Firefox | No (no Web Speech API) | Yes |

---

## Privacy and security

- **Audio.** Voxtab never records or stores audio. The browser's speech engine does the recognition; in Chrome and Edge this means audio is sent to the browser vendor's cloud speech service. If that is not acceptable, use typed commands.
- **No tracking.** There is no server, analytics or account. Settings, shortcuts and the last 25 commands live only in your browser's `localStorage`.
- **Safe URLs.** Only plain `http(s)` addresses are ever opened. `javascript:`, `data:`, `file:` and URLs with embedded credentials are rejected, including in custom shortcuts. Search text is always URL-encoded.
- **No injected HTML.** Transcripts and user text are inserted with `textContent`, never `innerHTML`.
- **Strict CSP.** The page ships a Content Security Policy that only allows its own scripts and styles.
- **Bounded actions.** A single command opens at most 5 tabs. Tabs are closed only if Voxtab opened them.
- **Hands-free caution.** *Keep listening* reacts to anything the microphone hears. Leave it off in noisy rooms, or combine it with *Ask before opening*.
- **Local server.** `npm start` binds to `127.0.0.1` only and serves just `index.html` and `/assets`, so nothing else in the project folder can be downloaded.

---

## Development

```bash
npm test      # parser, URL-safety and server tests (Node's built-in test runner)
npm start     # serve on http://localhost:5173
```

There are no runtime or development dependencies to install.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| "Microphone access is blocked" | Click the lock / mic icon in the address bar, allow the microphone, reload. |
| Nothing opens, but the result card appears | Pop-up blocker. Click **Open** on the card, and allow pop-ups for this page. |
| "Typing only" badge | Your browser has no speech recognition. Use Chrome, Edge or Safari. |
| "I didn't hear anything" | Speak right after the mic lights up, and check your input device. |
| It hears the wrong word | Use the typed box once to confirm the command works, then retry closer to the mic. |
| Needs an internet connection | Chrome and Edge recognize speech in the cloud. Typed commands work offline. |

---

## Limitations

- Voice recognition quality depends on your browser, microphone and language.
- Voxtab opens search results pages; it cannot click into "the first video" without an API key.
- Browsers decide whether a tab may open without a click, so the pop-up permission is outside Voxtab's control.
