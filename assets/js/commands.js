/**
 * Voice command parser.
 *
 * Pure functions only (no DOM, no browser APIs) so the whole grammar can be
 * unit-tested with `npm test`.
 *
 * parseCommand("open youtube and github") ->
 *   { intent: 'open', actions: [{ kind: 'open', url: 'https://www.youtube.com/', ... }, ...], say: 'Opening YouTube and GitHub.' }
 */

import { findSite, buildSearchUrl, siteInitials } from './sites.js';

/** Hard cap so a single (mis)heard sentence can never spawn a flood of tabs. */
export const MAX_TABS = 5;

/** Phrases shown in the UI. Every one of them is verified by the unit tests. */
export const EXAMPLES = [
  'Open YouTube',
  'Search for lo-fi beats on YouTube',
  'Open GitHub and Reddit',
  'Go to wikipedia.org',
  'Play Daft Punk',
  'Google how to center a div',
  'Find coffee shops near me on Google Maps',
  'Open a new tab with Spotify',
  'Close all tabs',
];

const OPEN_VERBS = [
  'open up', 'open', 'launch', 'visit', 'go to', 'goto', 'navigate to', 'take me to',
  'bring up', 'pull up', 'show me', 'load', 'start',
  // Indonesian, for the id-ID recognition language
  'bukakan', 'buka', 'kunjungi', 'pergi ke',
];

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const OPEN_VERB_RE = new RegExp(
  `^(?:${[...OPEN_VERBS].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})\\b\\s*`,
);

const NEW_TAB_RE = /^(?:(?:a|an|the|new)\s+)*(?:tab|window|page)\b\s*(?:for|with|to|on|at|of)?\s*/;

const LEADING_FILLERS = [
  /^(?:hey|hi|hello|ok|okay|yo)\s+(?:vox\s?tab|assistant|computer)\b[\s,]*/,
  /^vox\s?tab\b[\s,]*/,
  /^(?:please|kindly|just|now|tolong)\b[\s,]*/,
  /^(?:can|could|would|will)\s+you\s+(?:please\s+)?/,
  /^i\s+(?:want|need|wanna|would\s+like|'d\s+like)\s+to\s+/,
  /^i'd\s+like\s+to\s+/,
  /^let'?s\s+/,
  /^(?:hey|ok|okay)\s+/,
];
const TRAILING_FILLERS = /\s+(?:please|for me|thanks|thank you|now|ya|dong)$/;
const TARGET_SUFFIX = /\s+(?:web\s?site|site|page|home\s?page|app|tab|in (?:a )?new (?:tab|window))$/;

const CLOSE_ALL_RE = /^(?:close|shut|tutup)\s+(?:(?:all|every|everything|semua)\b.*|(?:the\s+|my\s+)?(?:tabs|windows)\b.*)$/;
const CLOSE_LAST_RE = /^(?:close|shut|tutup)\s+(?:the\s+|my\s+|that\s+|this\s+)?(?:(?:last|latest|recent|previous|newest)\s+)?(?:tab|window)\b.*$/;
const HELP_RE = /^(?:help|what can i say|what can you do|show commands|commands)$/;

const SITE_THEN_SEARCH_RE = /^(?:(?:and|then)\s+)?(?:search(?:\s+for)?|look\s*up|find|play|watch|for|cari(?:kan)?)\s+(.+)$/;
const SEARCH_VERB_RE = /^(search(?:\s+(?:for|about))?|look\s*up|find(?:\s+me)?|google|cari(?:kan)?(?:\s+tentang)?|play|watch|listen\s+to)\s+(.+)$/;
const QUERY_ON_SITE_RE = /^(.+)\s+(?:on|in|at|using|via|with|from|di)\s+(.+)$/;
const LIST_SPLIT_RE = /\s*(?:,|&|\band\b|\bthen\b|\bplus\b|\bdan\b)\s*/;

const COMMON_TLDS = [
  'com', 'org', 'net', 'io', 'dev', 'app', 'ai', 'co', 'id', 'edu', 'gov', 'info', 'me', 'tv',
  'xyz', 'site', 'online', 'tech', 'cloud', 'uk', 'us', 'de', 'fr', 'jp', 'sg', 'my', 'au', 'ca',
  'in', 'nl', 'es', 'it', 'br', 'kr', 'cn', 'ch', 'se', 'no', 'fi', 'pl', 'eu', 'news', 'blog',
  'store', 'shop', 'page', 'wiki', 'gg', 'fm', 'so', 'sh', 'to', 'ly', 'is', 'cc',
];
const DOMAIN_RE = new RegExp(
  `^(?:https?:\\/\\/)?((?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${COMMON_TLDS.join('|')}))(?::\\d{2,5})?(?:[\\/?#]\\S*)?$`,
);

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/**
 * Lower-case, collapse whitespace, turn "example dot com" into "example.com"
 * and drop punctuation that speech engines like to sprinkle in.
 */
export function normalize(input) {
  let s = String(input ?? '').normalize('NFKC').toLowerCase().replace(/[‘’ʼ]/g, "'");
  s = s.replace(/(?<=[\p{L}\p{N}])\s+dot\s+(?=[\p{L}\p{N}])/gu, '.');
  s = s.replace(/[^\p{L}\p{N}\s./:_\-+#&,'%?=@~]/gu, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^[.,!?;:]+/, '').replace(/[.,!?;:]+$/, '').trim();
  return s;
}

function stripFillers(text) {
  let current = text;
  for (let guard = 0; guard < 6; guard += 1) {
    let next = current;
    for (const re of LEADING_FILLERS) next = next.replace(re, '');
    next = next.replace(TRAILING_FILLERS, '').trim();
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * Only plain http(s) URLs without embedded credentials are ever opened.
 * This blocks `javascript:`, `data:`, `file:` and `user:pass@host` tricks.
 */
export function sanitizeUrl(value) {
  try {
    const url = new URL(String(value).trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function domainToUrl(text) {
  const match = DOMAIN_RE.exec(text);
  if (!match) return null;
  const url = sanitizeUrl(/^https?:\/\//.test(text) ? text : `https://${text}`);
  return url ? { url, host: match[1] } : null;
}

function cleanTarget(raw) {
  let name = raw.trim().replace(/^(?:the|a|an)\s+/, '');
  for (let i = 0; i < 3; i += 1) name = name.replace(TARGET_SUFFIX, '').trim();
  return name;
}

function initialsOf(text) {
  const letters = text.replace(/[^\p{L}\p{N}]/gu, '');
  return letters.length ? letters[0].toUpperCase() + (letters[1] ?? '').toLowerCase() : '?';
}

function openSiteAction(site) {
  return {
    kind: 'open', mode: 'open', label: site.name, detail: '', url: sanitizeUrl(site.home),
    siteId: site.id, color: site.color, initials: siteInitials(site),
  };
}

function searchAction(site, query) {
  return {
    kind: 'open', mode: 'search', label: site.name, detail: query, url: sanitizeUrl(buildSearchUrl(site, query)),
    siteId: site.id, query, color: site.color, initials: siteInitials(site),
  };
}

/** A name -> action, or null. Order: user shortcut, known site, bare domain. */
function resolveTarget(raw, shortcuts) {
  const name = cleanTarget(raw);
  if (!name) return null;

  const shortcut = shortcuts.find((s) => normalize(s.phrase) === name);
  if (shortcut) {
    const url = sanitizeUrl(shortcut.url);
    if (url) {
      return {
        kind: 'open', mode: 'shortcut', label: shortcut.phrase, detail: new URL(url).host, url,
        siteId: null, color: '#a78bfa', initials: initialsOf(shortcut.phrase),
      };
    }
  }

  const site = findSite(name);
  if (site) return openSiteAction(site);

  const domain = domainToUrl(name);
  if (domain) {
    return {
      kind: 'open', mode: 'domain', label: domain.host, detail: '', url: domain.url,
      siteId: null, color: '#7c8cff', initials: initialsOf(domain.host),
    };
  }
  return null;
}

/** "cats on youtube" -> { query: 'cats', site: YouTube }. Only sites that support search count. */
function splitQueryOnSite(text) {
  const match = QUERY_ON_SITE_RE.exec(text);
  if (!match) return null;
  const site = findSite(cleanTarget(match[2]));
  return site && site.search ? { query: match[1].trim(), site } : null;
}

function joinNames(names) {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function result(intent, transcript, normalized, actions, say, extra = {}) {
  return { intent, transcript, normalized, actions, say, ...extra };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * @param {string} input   what the user said or typed
 * @param {{ shortcuts?: Array<{phrase: string, url: string}> }} [options]
 */
export function parseCommand(input, { shortcuts = [] } = {}) {
  const transcript = String(input ?? '').trim();
  const text = stripFillers(normalize(input));
  if (!text) return result('empty', transcript, text, [], '');

  if (HELP_RE.test(text)) return result('help', transcript, text, [], 'Here is what you can say.');

  if (CLOSE_ALL_RE.test(text)) {
    return result('close', transcript, text, [{ kind: 'close', scope: 'all' }], 'Closing the tabs I opened.');
  }
  if (CLOSE_LAST_RE.test(text)) {
    return result('close', transcript, text, [{ kind: 'close', scope: 'last' }], 'Closing the last tab I opened.');
  }

  // Strip a leading "open / go to / launch ..." and an optional "a new tab with".
  let rest = text;
  const verb = OPEN_VERB_RE.exec(text);
  if (verb) rest = text.slice(verb[0].length).trim().replace(NEW_TAB_RE, '').trim();
  rest = rest.replace(/^(?:the|a|an)\s+/, '').trim();
  if (!rest) return unknown(transcript, text, '');

  // 1) "<site> [and] search <query>"   e.g. "youtube and search lo-fi beats"
  const words = rest.split(' ');
  for (let n = 1; n <= Math.min(3, words.length - 1); n += 1) {
    const site = findSite(words.slice(0, n).join(' '));
    const match = site && site.search ? SITE_THEN_SEARCH_RE.exec(words.slice(n).join(' ')) : null;
    if (match) {
      const query = match[1].trim();
      return result('search', transcript, text, [searchAction(site, query)], `Searching ${site.name} for ${query}.`);
    }
  }

  // 2) One or more targets: "youtube", "github and reddit", "wikipedia.org"
  const single = resolveTarget(rest, shortcuts);
  const parts = single ? [rest] : rest.split(LIST_SPLIT_RE).filter(Boolean);
  const targets = single ? [single] : parts.map((part) => resolveTarget(part, shortcuts));
  if (targets.length > 0 && targets.every(Boolean)) {
    const unique = [...new Map(targets.map((t) => [t.url, t])).values()];
    const actions = unique.slice(0, MAX_TABS);
    const names = actions.map((a) => a.label);
    const trimmed = unique.length > MAX_TABS;
    return result('open', transcript, text, actions,
      `Opening ${joinNames(names)}.${trimmed ? ` I limit myself to ${MAX_TABS} tabs at a time.` : ''}`,
      { truncated: trimmed });
  }

  // 3) "search for <query> [on <site>]", "play <query>", "google <query>"
  const searchMatch = SEARCH_VERB_RE.exec(rest);
  if (searchMatch) {
    const verbWord = searchMatch[1];
    const query = searchMatch[2].trim();
    const split = splitQueryOnSite(query);
    if (split) {
      return result('search', transcript, text, [searchAction(split.site, split.query)],
        `Searching ${split.site.name} for ${split.query}.`);
    }
    const fallbackId = /^(?:play|watch)/.test(verbWord) ? 'youtube' : 'google';
    const site = findSite(fallbackId);
    return result('search', transcript, text, [searchAction(site, query)], `Searching ${site.name} for ${query}.`);
  }

  // 4) "<query> on <site>" after an open-style verb, e.g. "show me cats on youtube"
  if (verb) {
    const split = splitQueryOnSite(rest);
    if (split) {
      return result('search', transcript, text, [searchAction(split.site, split.query)],
        `Searching ${split.site.name} for ${split.query}.`);
    }
  }

  return unknown(transcript, text, rest);
}

function unknown(transcript, normalized, rest) {
  const google = findSite('google');
  return result('unknown', transcript, normalized, [],
    rest ? `I couldn't find a site called ${rest}.` : "I didn't catch a site or search in that.",
    { suggestion: rest ? searchAction(google, rest) : null });
}

/**
 * Speech engines return several guesses for the same audio. Use the first one
 * that actually makes sense as a command, otherwise fall back to the top guess.
 */
export function pickBestParse(alternatives, options) {
  const parses = alternatives.map((text) => parseCommand(text, options));
  const usable = parses.find((p) => p.intent !== 'unknown' && p.intent !== 'empty');
  return usable ?? parses[0] ?? parseCommand('', options);
}
