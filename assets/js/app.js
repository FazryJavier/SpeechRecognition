/**
 * Voxtab – application wiring.
 *
 * speech.js (audio -> text)  ->  commands.js (text -> intent)  ->  this file (intent -> tabs + UI)
 *
 * Every piece of user/speech text reaches the page through `textContent`
 * (never innerHTML), and every URL is re-validated before it is opened.
 */

import { parseCommand, pickBestParse, normalize, sanitizeUrl, EXAMPLES } from './commands.js';
import { SITES, siteInitials } from './sites.js';
import {
  LANGUAGES, ERROR_MESSAGES, createListener, isRecognitionSupported, speak, cancelSpeech,
} from './speech.js';
import { Visualizer } from './visualizer.js';
import { load, save, loadRaw, saveRaw } from './storage.js';

/* ------------------------------------------------------------------ */
/* DOM helpers                                                         */
/* ------------------------------------------------------------------ */

const $ = (id) => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Create an element. `style` takes an object of CSS custom properties. */
function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'style') for (const [name, v] of Object.entries(value)) node.style.setProperty(name, v);
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) if (child !== null && child !== undefined) node.append(child);
  return node;
}

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

const badge = (action) => h('span', { class: 'badge', style: { '--c': action.color }, text: action.initials, 'aria-hidden': 'true' });

/* ------------------------------------------------------------------ */
/* State (persisted parts are validated on load)                       */
/* ------------------------------------------------------------------ */

const DEFAULT_SETTINGS = { lang: 'en-US', speak: false, confirm: false, keepListening: false };
const MAX_HISTORY = 25;
const MAX_SHORTCUTS = 20;

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

const settings = (() => {
  const stored = load('settings', {}, isObject);
  return {
    lang: LANGUAGES.some((l) => l.code === stored.lang) ? stored.lang : DEFAULT_SETTINGS.lang,
    speak: stored.speak === true,
    confirm: stored.confirm === true,
    keepListening: stored.keepListening === true,
  };
})();

let shortcuts = load('shortcuts', [], Array.isArray)
  .filter((s) => isObject(s) && typeof s.phrase === 'string' && typeof s.url === 'string' && sanitizeUrl(s.url))
  .slice(0, MAX_SHORTCUTS);

let history = load('history', [], Array.isArray)
  .filter((e) => isObject(e) && typeof e.text === 'string' && typeof e.time === 'number')
  .map((e) => ({ text: e.text.slice(0, 200), time: e.time, intent: String(e.intent ?? ''), labels: Array.isArray(e.labels) ? e.labels.map(String).slice(0, MAX_HISTORY) : [] }))
  .slice(0, MAX_HISTORY);

/** Tabs this page opened (browsers only let us close those). */
const openedTabs = [];

/* ------------------------------------------------------------------ */
/* Elements                                                            */
/* ------------------------------------------------------------------ */

const el = {
  orbWrap: document.querySelector('.orb-wrap'),
  mic: $('micButton'),
  status: $('status'),
  transcript: $('transcript'),
  form: $('commandForm'),
  input: $('commandInput'),
  result: $('resultCard'),
  chips: $('exampleChips'),
  siteGrid: $('siteGrid'),
  supportPill: $('supportPill'),
  supportText: $('supportText'),
  unsupported: $('unsupported'),
  theme: $('themeToggle'),
  toasts: $('toasts'),
  historyList: $('historyList'),
  historyEmpty: $('historyEmpty'),
  clearHistory: $('clearHistory'),
  shortcutForm: $('shortcutForm'),
  shortcutPhrase: $('shortcutPhrase'),
  shortcutUrl: $('shortcutUrl'),
  shortcutError: $('shortcutError'),
  shortcutList: $('shortcutList'),
  shortcutEmpty: $('shortcutEmpty'),
  lang: $('langSelect'),
  optSpeak: $('optSpeak'),
  optConfirm: $('optConfirm'),
  optKeep: $('optKeep'),
};

/* ------------------------------------------------------------------ */
/* Status, transcript, toasts                                          */
/* ------------------------------------------------------------------ */

let statusTone = '';

function setStatus(message, tone = '') {
  statusTone = tone;
  el.status.dataset.tone = tone;
  el.status.replaceChildren(message);
}

function setIdleStatus() {
  statusTone = '';
  el.status.dataset.tone = '';
  if (window.matchMedia('(hover: none)').matches) {
    el.status.replaceChildren('Tap the mic to start');
  } else {
    el.status.replaceChildren('Tap the mic or press ', h('kbd', { text: 'Space' }));
  }
}

function showTranscript(text, isFinal) {
  el.transcript.replaceChildren(h('span', { class: isFinal ? 'final' : 'interim', text: `“${text}”` }));
}

function notify(message, { tone = 'ok', action = null, timeout = 4800 } = {}) {
  while (el.toasts.children.length >= 3) el.toasts.firstElementChild.remove();
  const toast = h('div', { class: 'toast', 'data-tone': tone }, h('p', { text: message }));
  if (action) {
    toast.append(h('button', {
      class: 'btn btn-sm', type: 'button', text: action.label,
      onclick: () => { action.onClick(); dismiss(); },
    }));
  }
  let timer = 0;
  const dismiss = () => {
    clearTimeout(timer);
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 260);
  };
  el.toasts.append(toast);
  timer = setTimeout(dismiss, timeout);
}

function flashOrb(kind) {
  const cls = kind === 'error' ? 'is-error' : 'is-success';
  el.orbWrap.classList.remove('is-error', 'is-success');
  void el.orbWrap.offsetWidth; // restart the animation
  el.orbWrap.classList.add(cls);
  setTimeout(() => el.orbWrap.classList.remove(cls), 800);
}

/* ------------------------------------------------------------------ */
/* Opening and closing tabs                                            */
/* ------------------------------------------------------------------ */

/**
 * Open each action in a new tab. `window.open` returns null when the browser's
 * pop-up blocker refuses, which is how we detect "blocked".
 */
function openActions(actions) {
  const opened = [];
  const blocked = [];
  for (const action of actions) {
    if (action.kind !== 'open') continue;
    const url = sanitizeUrl(action.url);
    if (!url) continue;
    const tab = window.open(url, '_blank');
    if (tab) {
      try { tab.opener = null; } catch { /* cross-origin already: nothing to do */ }
      openedTabs.push(tab);
      opened.push(action);
    } else {
      blocked.push(action);
    }
  }
  return { opened, blocked };
}

function closeTabs(scope) {
  for (let i = openedTabs.length - 1; i >= 0; i -= 1) if (openedTabs[i].closed) openedTabs.splice(i, 1);
  const targets = scope === 'last' ? openedTabs.splice(-1) : openedTabs.splice(0);
  let closed = 0;
  for (const tab of targets) {
    try { tab.close(); closed += 1; } catch { /* ignore */ }
  }
  return closed;
}

/* ------------------------------------------------------------------ */
/* Result card                                                         */
/* ------------------------------------------------------------------ */

function hideResult() {
  el.result.hidden = true;
  el.result.replaceChildren();
}

function actionRow(action, { again = false } = {}) {
  const url = sanitizeUrl(action.url);
  const detail = action.mode === 'search' ? `Search: ${action.detail}` : action.detail || (url ? new URL(url).host : '');
  return h('div', { class: 'action-row' },
    badge(action),
    h('div', { class: 'action-text' },
      h('div', { class: 'action-label', text: action.label }),
      h('div', { class: 'action-detail', text: detail })),
    url && h('a', { class: 'open-link', href: url, target: '_blank', rel: 'noopener noreferrer' },
      again ? 'Open again' : 'Open', icon('external')));
}

/**
 * status: 'opened' | 'pending' | 'blocked' | 'unknown'
 */
function renderResult(parsed, status, { opened = [], blocked = [] } = {}) {
  const total = parsed.actions.length;
  const copy = {
    opened: { icon: 'check', title: total === 1 ? 'Opened in a new tab' : `Opened ${total} tabs` },
    pending: { icon: 'mic', title: total === 1 ? 'Ready to open' : `Ready to open ${total} tabs` },
    blocked: { icon: 'alert', title: opened.length ? `Opened ${opened.length} of ${total} tabs` : 'Your browser blocked the pop-up' },
    unknown: { icon: 'help', title: 'Not sure what to open' },
  }[status];

  const head = h('div', { class: 'result-head' },
    h('span', { class: 'result-icon' }, icon(copy.icon)),
    h('div', {},
      h('div', { class: 'result-title', text: copy.title }),
      h('div', { class: 'result-say', text: parsed.transcript ? `“${parsed.transcript}”` : '' })),
    h('button', { class: 'btn btn-ghost', type: 'button', 'aria-label': 'Dismiss', onclick: hideResult }, icon('x')));

  const body = h('div', { class: 'actions' });
  const foot = h('div', { class: 'result-foot' });

  if (status === 'unknown') {
    body.append(h('p', { class: 'result-say', text: parsed.say }));
    if (parsed.suggestion) {
      body.append(actionRow(parsed.suggestion));
      foot.append(
        h('button', {
          class: 'btn btn-primary', type: 'button', text: `Search Google instead`,
          onclick: () => finishOpen({ ...parsed, intent: 'search', actions: [parsed.suggestion], say: `Searching Google for ${parsed.suggestion.query}.` }, 'click'),
        }),
        h('p', { class: 'result-note', text: 'Try “open YouTube”, “search cats on YouTube”, or say “help”.' }));
    }
  } else {
    const openedSet = new Set(opened);
    parsed.actions.forEach((action) => body.append(actionRow(action, { again: openedSet.has(action) })));

    if (status === 'pending' || status === 'blocked') {
      const remaining = status === 'pending' ? parsed.actions : blocked;
      foot.append(h('button', {
        class: 'btn btn-primary', type: 'button',
        text: remaining.length === 1 ? 'Open it' : `Open ${remaining.length} tabs`,
        onclick: () => {
          const outcome = openActions(remaining);
          if (outcome.blocked.length) {
            notify('Still blocked. Allow pop-ups for this page in your address bar.', { tone: 'warn' });
          } else {
            renderResult(parsed, 'opened', { opened: parsed.actions });
            setStatus(parsed.say, 'ok');
            flashOrb('success');
          }
        },
      }));
    }
    if (status === 'pending') {
      foot.append(h('p', { class: 'result-note', text: '“Ask before opening” is on. Turn it off in Settings to open instantly.' }));
    } else if (status === 'blocked') {
      foot.append(h('p', { class: 'result-note', text: 'Browsers only allow tabs from a click. Click above, or allow pop-ups for this page so voice commands can open tabs directly.' }));
    }
  }

  el.result.dataset.status = status;
  el.result.replaceChildren(head, body, foot.children.length ? foot : '');
  el.result.hidden = false;
}

/* ------------------------------------------------------------------ */
/* Running commands                                                    */
/* ------------------------------------------------------------------ */

let speaking = Promise.resolve();

function reply(text) {
  if (!settings.speak || !text) return;
  speaking = speak(text);
}

/** Open (or stage) the tabs for an open/search result. */
function finishOpen(parsed, source) {
  // Clicks on a chip or site tile ARE the confirmation, so they skip "ask first".
  if (settings.confirm && source !== 'click') {
    renderResult(parsed, 'pending');
    setStatus('Ready when you are.', 'ok');
    reply(parsed.say.replace(/^Opening/, 'Ready to open'));
    return;
  }
  const outcome = openActions(parsed.actions);
  if (outcome.blocked.length) {
    renderResult(parsed, 'blocked', outcome);
    setStatus(outcome.opened.length ? 'Some tabs were blocked.' : 'Pop-up blocked. Click Open below.', 'error');
    flashOrb('error');
    reply('Your browser blocked the pop-up. Please click open.');
    return;
  }
  renderResult(parsed, 'opened', outcome);
  setStatus(parsed.say, 'ok');
  flashOrb('success');
  reply(parsed.say);
}

function addHistory(parsed) {
  const labels = parsed.intent === 'close'
    ? ['Closed tabs']
    : parsed.actions.map((a) => (a.mode === 'search' ? `${a.label}: ${a.detail}` : a.label));
  if (history[0]?.text === parsed.transcript) history.shift();
  history.unshift({ text: parsed.transcript, time: Date.now(), intent: parsed.intent, labels });
  history = history.slice(0, MAX_HISTORY);
  save('history', history);
  renderHistory();
}

function runParsed(parsed, source) {
  if (parsed.intent === 'empty') return;

  if (parsed.intent === 'help') {
    hideResult();
    $('guide').scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    setStatus('Here is what you can say.', 'ok');
    reply(parsed.say);
    return;
  }

  addHistory(parsed);

  if (parsed.intent === 'close') {
    hideResult();
    const closed = closeTabs(parsed.actions[0].scope);
    if (closed) {
      setStatus(`Closed ${closed} tab${closed === 1 ? '' : 's'}.`, 'ok');
      flashOrb('success');
      reply(closed === 1 ? 'Closed one tab.' : `Closed ${closed} tabs.`);
    } else {
      setStatus('No tabs to close.', 'error');
      notify('I can only close tabs that Voxtab opened during this visit.', { tone: 'warn' });
    }
    return;
  }

  if (parsed.intent === 'unknown') {
    renderResult(parsed, 'unknown');
    setStatus("I didn't understand that.", 'error');
    flashOrb('error');
    if (!settings.keepListening) reply(parsed.say); // never talk back in hands-free mode: the mic would hear it
    return;
  }

  finishOpen(parsed, source);
}

function runText(text, source) {
  const parsed = parseCommand(text, { shortcuts });
  showTranscript(parsed.transcript, true);
  runParsed(parsed, source);
}

/* ------------------------------------------------------------------ */
/* Listening                                                           */
/* ------------------------------------------------------------------ */

const viz = new Visualizer($('viz'), (level) => el.orbWrap.style.setProperty('--level', level.toFixed(3)));
let listener = null;
let listening = false;
let wantListening = false;
let restartTimer = 0;

function setListeningUi(on) {
  el.orbWrap.classList.toggle('is-listening', on);
  el.mic.setAttribute('aria-pressed', String(on));
  el.mic.setAttribute('aria-label', on ? 'Stop listening' : 'Start listening');
  viz.setState(on ? 'listening' : 'idle');
}

function ensureListener() {
  if (listener || !isRecognitionSupported) return listener;
  listener = createListener({
    onStart() {
      listening = true;
      setListeningUi(true);
      setStatus('Listening… say a command', 'listening');
    },
    onInterim: (text) => showTranscript(text, false),
    onFinal(alternatives) {
      const parsed = pickBestParse(alternatives, { shortcuts });
      showTranscript(parsed.transcript || alternatives[0], true);
      runParsed(parsed, 'voice');
    },
    onError(code) {
      if (code === 'aborted') return;
      const fatal = code === 'not-allowed' || code === 'service-not-allowed' || code === 'audio-capture';
      if (fatal) {
        wantListening = false;
        updateSupportPill('denied');
        notify(ERROR_MESSAGES[code], { tone: 'error', timeout: 8000 });
      }
      if (!(code === 'no-speech' && settings.keepListening)) {
        setStatus(ERROR_MESSAGES[code] ?? `Speech recognition error (${code}).`, code === 'no-speech' ? '' : 'error');
        if (code !== 'no-speech') flashOrb('error');
      }
    },
    onEnd() {
      listening = false;
      if (wantListening && settings.keepListening) {
        // Hands-free: wait for any spoken reply to finish, then listen again.
        restartTimer = setTimeout(() => speaking.then(() => {
          if (wantListening) startRecognition();
        }), 250);
        return;
      }
      wantListening = false;
      setListeningUi(false);
      viz.releaseMicrophone();
      if (statusTone === 'listening') setIdleStatus();
    },
  });
  return listener;
}

function startRecognition() {
  try {
    listener.start(settings.lang);
  } catch {
    /* already running */
  }
}

function startListening() {
  if (!ensureListener()) {
    notify('This browser has no speech recognition. Type your command instead.', { tone: 'warn' });
    el.input.focus();
    return;
  }
  if (listening) return;
  cancelSpeech();
  clearTimeout(restartTimer);
  wantListening = true;
  setStatus('Starting microphone…');
  startRecognition();
  viz.attachMicrophone();
}

function stopListening() {
  wantListening = false;
  clearTimeout(restartTimer);
  try { listener?.stop(); } catch { /* ignore */ }
  if (!listening) {
    setListeningUi(false);
    viz.releaseMicrophone();
    if (statusTone === 'listening' || statusTone === '') setIdleStatus();
  }
}

const toggleListening = () => (wantListening || listening ? stopListening() : startListening());

/* ------------------------------------------------------------------ */
/* Support / permission pill                                           */
/* ------------------------------------------------------------------ */

function updateSupportPill(permission) {
  if (!isRecognitionSupported) {
    el.supportPill.dataset.state = 'unsupported';
    el.supportText.textContent = 'Typing only';
  } else if (permission === 'denied') {
    el.supportPill.dataset.state = 'blocked';
    el.supportText.textContent = 'Mic blocked';
  } else {
    el.supportPill.dataset.state = 'ready';
    el.supportText.textContent = 'Voice ready';
  }
}

function initSupport() {
  updateSupportPill('prompt');
  if (!isRecognitionSupported) {
    el.unsupported.hidden = false;
    el.mic.disabled = true;
    el.mic.setAttribute('aria-label', 'Speech recognition is not supported in this browser');
    return;
  }
  navigator.permissions?.query({ name: 'microphone' }).then((status) => {
    updateSupportPill(status.state);
    status.onchange = () => updateSupportPill(status.state);
  }).catch(() => { /* permissions API for microphone not available */ });
}

/* ------------------------------------------------------------------ */
/* History, shortcuts, sites, examples                                 */
/* ------------------------------------------------------------------ */

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function renderHistory() {
  el.historyList.replaceChildren(...history.map((entry) => h('li', {},
    h('div', { class: 'grow' },
      h('div', { class: 'title', text: `“${entry.text}”` }),
      h('div', { class: 'sub', text: `${formatTime(entry.time)} · ${entry.labels.length ? entry.labels.join(', ') : 'Not understood'}` })),
    h('button', { class: 'mini-btn', type: 'button', 'aria-label': `Run again: ${entry.text}`, title: 'Run again', 'data-say': entry.text }, icon('replay')))));
  el.historyEmpty.hidden = history.length > 0;
  el.clearHistory.hidden = history.length === 0;
}

function renderShortcuts() {
  el.shortcutList.replaceChildren(...shortcuts.map((s) => {
    const url = sanitizeUrl(s.url);
    return h('li', {},
      h('div', { class: 'grow' },
        h('div', { class: 'title', text: s.phrase }),
        h('div', { class: 'sub', text: url ? `${new URL(url).host}${new URL(url).pathname === '/' ? '' : new URL(url).pathname}` : '' })),
      h('button', { class: 'mini-btn', type: 'button', 'aria-label': `Open ${s.phrase}`, title: 'Try it', 'data-say': `open ${s.phrase}` }, icon('external')),
      h('button', {
        class: 'mini-btn danger', type: 'button', 'aria-label': `Delete shortcut ${s.phrase}`, title: 'Delete',
        onclick: () => {
          shortcuts = shortcuts.filter((x) => x !== s);
          save('shortcuts', shortcuts);
          renderShortcuts();
        },
      }, icon('trash')));
  }));
  el.shortcutEmpty.hidden = shortcuts.length > 0;
}

function showShortcutError(message) {
  el.shortcutError.hidden = !message;
  el.shortcutError.textContent = message ?? '';
}

function addShortcut(event) {
  event.preventDefault();
  const phrase = el.shortcutPhrase.value.trim().replace(/\s+/g, ' ');
  const key = normalize(phrase);
  let rawUrl = el.shortcutUrl.value.trim();

  if (key.length < 2 || phrase.length > 40) return showShortcutError('Use a phrase between 2 and 40 characters.');
  if (!rawUrl) return showShortcutError('Enter the web address to open.');
  if (!/^[a-z][a-z0-9+.-]*:/i.test(rawUrl)) rawUrl = `https://${rawUrl}`;
  const url = sanitizeUrl(rawUrl);
  if (!url) return showShortcutError('That is not a valid web address. It must start with http:// or https://.');

  const existing = shortcuts.findIndex((s) => normalize(s.phrase) === key);
  if (existing === -1 && shortcuts.length >= MAX_SHORTCUTS) return showShortcutError(`You can keep up to ${MAX_SHORTCUTS} shortcuts.`);

  const entry = { phrase, url };
  if (existing === -1) shortcuts.unshift(entry);
  else shortcuts[existing] = entry;
  save('shortcuts', shortcuts);
  renderShortcuts();
  showShortcutError(null);
  el.shortcutForm.reset();
  notify(`Saved. Say “open ${phrase.toLowerCase()}”.`);
  return undefined;
}

function renderSites() {
  el.siteGrid.replaceChildren(...SITES.map((site) => h('li', {},
    h('button', { class: 'site-btn', type: 'button', 'data-say': `Open ${site.name}` },
      h('span', { class: 'badge', style: { '--c': site.color }, text: siteInitials(site), 'aria-hidden': 'true' }),
      h('span', { text: site.name })))));
}

function renderExamples() {
  el.chips.replaceChildren(...EXAMPLES.map((text) => h('li', {},
    h('button', { class: 'chip', type: 'button', 'data-say': text, text: `“${text}”` }))));
}

/* ------------------------------------------------------------------ */
/* Settings & theme                                                    */
/* ------------------------------------------------------------------ */

function initSettings() {
  el.lang.replaceChildren(...LANGUAGES.map((l) => h('option', { value: l.code, text: l.label })));
  el.lang.value = settings.lang;
  el.optSpeak.checked = settings.speak;
  el.optConfirm.checked = settings.confirm;
  el.optKeep.checked = settings.keepListening;

  const persist = () => save('settings', settings);
  el.lang.addEventListener('change', () => { settings.lang = el.lang.value; persist(); });
  el.optSpeak.addEventListener('change', () => { settings.speak = el.optSpeak.checked; if (!settings.speak) cancelSpeech(); persist(); });
  el.optConfirm.addEventListener('change', () => { settings.confirm = el.optConfirm.checked; persist(); });
  el.optKeep.addEventListener('change', () => {
    settings.keepListening = el.optKeep.checked;
    if (settings.keepListening) {
      notify('Hands-free is on. Allow pop-ups for this page, and keep “Ask before opening” on if unsure.', { tone: 'warn', timeout: 7000 });
    }
    persist();
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#f4f5fb' : '#07080d');
  viz.refreshColors();
}

function initTheme() {
  el.theme.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    saveRaw('theme', next);
  });
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (event) => {
    if (!loadRaw('theme')) applyTheme(event.matches ? 'light' : 'dark');
  });
}

/* ------------------------------------------------------------------ */
/* Events                                                              */
/* ------------------------------------------------------------------ */

function bindEvents() {
  el.mic.addEventListener('click', toggleListening);

  el.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = el.input.value.trim();
    if (!value) return;
    el.input.value = '';
    runText(value, 'typed');
  });

  el.clearHistory.addEventListener('click', () => {
    history = [];
    save('history', history);
    renderHistory();
  });
  el.shortcutForm.addEventListener('submit', addShortcut);

  // Any element with data-say runs that phrase when clicked (chips, site tiles, history, guide).
  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-say]') : null;
    if (target) runText(target.dataset.say, 'click');
  });

  document.addEventListener('keydown', (event) => {
    const tag = event.target instanceof Element ? event.target.tagName : '';
    const typing = ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(tag) || event.target.isContentEditable;
    if (event.key === 'Escape') stopListening();
    if (event.metaKey || event.ctrlKey || event.altKey || typing) return;
    if (event.code === 'Space') { event.preventDefault(); toggleListening(); }
    if (event.key === '/') { event.preventDefault(); el.input.focus(); }
  });

  document.addEventListener('visibilitychange', () => (document.hidden ? viz.stop() : viz.start()));
  window.addEventListener('pagehide', () => {
    try { listener?.abort(); } catch { /* ignore */ }
    viz.releaseMicrophone();
    cancelSpeech();
  });
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */

initSupport();
initSettings();
initTheme();
renderExamples();
renderSites();
renderShortcuts();
renderHistory();
bindEvents();
setIdleStatus();
viz.start();
