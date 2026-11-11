import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseCommand, pickBestParse, normalize, sanitizeUrl, EXAMPLES, MAX_TABS } from '../assets/js/commands.js';
import { SITES, findSite, siteKey, buildSearchUrl } from '../assets/js/sites.js';

const urls = (parsed) => parsed.actions.map((a) => a.url);

/* ---------------------------- normalize ---------------------------- */

test('normalize lowercases, trims and drops trailing punctuation', () => {
  assert.equal(normalize('  Open YouTube!  '), 'open youtube');
  assert.equal(normalize('Open   GitHub, please.'), 'open github, please');
});

test('normalize turns spoken "dot" into a real dot', () => {
  assert.equal(normalize('go to example dot com'), 'go to example.com');
  assert.equal(normalize('bbc dot co dot uk'), 'bbc.co.uk');
});

test('normalize survives non-string input', () => {
  assert.equal(normalize(undefined), '');
  assert.equal(normalize(null), '');
  assert.equal(normalize(42), '42');
});

/* ------------------------------ open ------------------------------- */

test('opens a known site', () => {
  const p = parseCommand('Open YouTube');
  assert.equal(p.intent, 'open');
  assert.deepEqual(urls(p), ['https://www.youtube.com/']);
  assert.equal(p.say, 'Opening YouTube.');
});

test('understands spoken-name variants ("you tube", "stack overflow")', () => {
  assert.deepEqual(urls(parseCommand('open you tube')), ['https://www.youtube.com/']);
  assert.deepEqual(urls(parseCommand('open Stack Overflow')), ['https://stackoverflow.com/']);
});

test('accepts many verbs and polite filler', () => {
  for (const phrase of [
    'launch github',
    'please open github',
    'can you open github for me',
    'hey voxtab open github',
    'I want to open github',
    'go to github',
    'take me to github',
    'open the github website',
    'open a new tab with github',
    'github',
  ]) {
    assert.deepEqual(urls(parseCommand(phrase)), ['https://github.com/'], phrase);
  }
});

test('understands the Indonesian verb "buka"', () => {
  assert.deepEqual(urls(parseCommand('buka youtube')), ['https://www.youtube.com/']);
});

test('opens several sites in one sentence', () => {
  const p = parseCommand('open github and reddit');
  assert.equal(p.intent, 'open');
  assert.deepEqual(urls(p), ['https://github.com/', 'https://www.reddit.com/']);
  assert.equal(p.say, 'Opening GitHub and Reddit.');

  assert.equal(parseCommand('open youtube, google and github').actions.length, 3);
});

test('de-duplicates repeated sites', () => {
  assert.equal(parseCommand('open youtube and youtube').actions.length, 1);
});

test('caps the number of tabs per command', () => {
  const p = parseCommand('open youtube, google, github, reddit, spotify, netflix, twitch');
  assert.equal(p.actions.length, MAX_TABS);
  assert.equal(p.truncated, true);
});

test('opens a bare domain over https', () => {
  assert.deepEqual(urls(parseCommand('go to wikipedia.org')), ['https://wikipedia.org/']);
  assert.deepEqual(urls(parseCommand('open example dot com')), ['https://example.com/']);
  assert.deepEqual(urls(parseCommand('visit docs.python.org/3/')), ['https://docs.python.org/3/']);
});

/* ----------------------------- search ------------------------------ */

test('searches a specific site', () => {
  const p = parseCommand('Search for lo-fi beats on YouTube');
  assert.equal(p.intent, 'search');
  assert.deepEqual(urls(p), ['https://www.youtube.com/results?search_query=lo-fi%20beats']);
  assert.equal(p.say, 'Searching YouTube for lo-fi beats.');
});

test('"open <site> and search <query>" works', () => {
  assert.deepEqual(
    urls(parseCommand('open youtube and search for cute cats')),
    ['https://www.youtube.com/results?search_query=cute%20cats'],
  );
  assert.deepEqual(
    urls(parseCommand('google search react hooks')),
    ['https://www.google.com/search?q=react%20hooks'],
  );
});

test('plain search defaults to Google; play/watch default to YouTube', () => {
  assert.deepEqual(urls(parseCommand('google how to center a div')), ['https://www.google.com/search?q=how%20to%20center%20a%20div']);
  assert.deepEqual(urls(parseCommand('search for best pizza in rome')), ['https://www.google.com/search?q=best%20pizza%20in%20rome']);
  assert.deepEqual(urls(parseCommand('play daft punk')), ['https://www.youtube.com/results?search_query=daft%20punk']);
  assert.deepEqual(urls(parseCommand('watch cooking videos')), ['https://www.youtube.com/results?search_query=cooking%20videos']);
});

test('uses the LAST "on <site>" so queries may contain "on"', () => {
  assert.deepEqual(
    urls(parseCommand('search for tips on sleeping on youtube')),
    ['https://www.youtube.com/results?search_query=tips%20on%20sleeping'],
  );
});

test('"show me <query> on <site>" searches the site', () => {
  assert.deepEqual(
    urls(parseCommand('show me cats on youtube')),
    ['https://www.youtube.com/results?search_query=cats'],
  );
});

test('multi-word site names in searches', () => {
  assert.deepEqual(
    urls(parseCommand('find coffee shops near me on google maps')),
    ['https://www.google.com/maps/search/coffee%20shops%20near%20me'],
  );
});

test('search queries are URL-encoded (no query-string injection)', () => {
  const p = parseCommand('search for a&b=c#frag on youtube');
  assert.equal(p.actions.length, 1);
  const url = new URL(p.actions[0].url);
  assert.equal(url.searchParams.get('search_query'), 'a&b=c#frag');
  assert.equal(url.hash, '');
});

test('"on" with an unknown site falls back to Google with the full query', () => {
  assert.deepEqual(
    urls(parseCommand('search for hotels in bali')),
    ['https://www.google.com/search?q=hotels%20in%20bali'],
  );
});

/* ------------------------------ close ------------------------------ */

test('close commands', () => {
  assert.deepEqual(parseCommand('close all tabs').actions, [{ kind: 'close', scope: 'all' }]);
  assert.deepEqual(parseCommand('close the tabs').actions, [{ kind: 'close', scope: 'all' }]);
  assert.deepEqual(parseCommand('close the last tab').actions, [{ kind: 'close', scope: 'last' }]);
  assert.deepEqual(parseCommand('close tab').actions, [{ kind: 'close', scope: 'last' }]);
  assert.equal(parseCommand('close all tabs').intent, 'close');
});

/* --------------------------- shortcuts ----------------------------- */

test('custom shortcuts take priority and are sanitised', () => {
  const shortcuts = [
    { phrase: 'my docs', url: 'https://docs.example.com/home' },
    { phrase: 'evil', url: 'javascript:alert(1)' },
    { phrase: 'github', url: 'https://github.com/my-org' },
  ];
  assert.deepEqual(urls(parseCommand('open my docs', { shortcuts })), ['https://docs.example.com/home']);
  assert.equal(parseCommand('open my docs', { shortcuts }).actions[0].mode, 'shortcut');
  // shortcut shadows the built-in site of the same name
  assert.deepEqual(urls(parseCommand('open github', { shortcuts })), ['https://github.com/my-org']);
  // unsafe shortcut is ignored, never opened
  assert.notEqual(parseCommand('open evil', { shortcuts }).intent, 'open');
});

/* ----------------------- unknown / help / empty -------------------- */

test('unknown commands never open anything and suggest a Google search', () => {
  const p = parseCommand('open my favourite imaginary place');
  assert.equal(p.intent, 'unknown');
  assert.equal(p.actions.length, 0);
  assert.deepEqual(
    p.suggestion && p.suggestion.url,
    'https://www.google.com/search?q=my%20favourite%20imaginary%20place',
  );
});

test('empty / whitespace / punctuation-only input is "empty"', () => {
  for (const input of ['', '   ', '...', '?!', null, undefined]) {
    assert.equal(parseCommand(input).intent, 'empty', String(input));
  }
});

test('help intent', () => {
  assert.equal(parseCommand('what can I say').intent, 'help');
});

test('"open" with nothing after it is unknown, not a crash', () => {
  assert.equal(parseCommand('open').intent, 'unknown');
  assert.equal(parseCommand('open a new tab').intent, 'unknown');
});

/* --------------------------- pickBestParse ------------------------- */

test('pickBestParse prefers the first usable alternative', () => {
  const best = pickBestParse(['open you to', 'open youtube', 'open you tube']);
  assert.equal(best.intent, 'open');
  assert.deepEqual(urls(best), ['https://www.youtube.com/']);
});

test('pickBestParse falls back to the top guess when nothing is usable', () => {
  const best = pickBestParse(['qwerty asdf', 'zxcv']);
  assert.equal(best.intent, 'unknown');
  assert.equal(best.transcript, 'qwerty asdf');
});

/* ------------------------------ safety ----------------------------- */

test('sanitizeUrl only allows plain http(s) URLs', () => {
  assert.equal(sanitizeUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(sanitizeUrl('http://example.com'), 'http://example.com/');
  for (const bad of [
    'javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd',
    'ftp://example.com', 'https://user:pass@example.com', 'not a url', '', null, undefined,
  ]) {
    assert.equal(sanitizeUrl(bad), null, String(bad));
  }
});

test('every produced URL is http(s) for hostile-looking transcripts', () => {
  for (const phrase of [
    'open javascript:alert(1)',
    'go to https://user:pass@evil.com',
    'open data:text/html,hello',
    'open file:///etc/passwd',
    'search for <script>alert(1)</script> on youtube',
  ]) {
    for (const action of parseCommand(phrase).actions) {
      if (action.kind === 'open') assert.match(action.url, /^https?:\/\//, phrase);
    }
  }
});

/* ------------------------------ catalog ---------------------------- */

test('site catalog has unique ids, valid URLs and consistent templates', () => {
  const ids = new Set();
  for (const site of SITES) {
    assert.ok(!ids.has(site.id), `duplicate id ${site.id}`);
    ids.add(site.id);
    assert.ok(sanitizeUrl(site.home), `${site.id} home`);
    if (site.search) {
      assert.ok(site.search.includes('{q}'), `${site.id} template needs {q}`);
      assert.ok(sanitizeUrl(buildSearchUrl(site, 'test')), `${site.id} search url`);
    }
  }
});

test('site lookup ignores case, spaces and punctuation', () => {
  assert.equal(siteKey('Stack Overflow!'), 'stackoverflow');
  assert.equal(findSite('GITHUB').id, 'github');
  assert.equal(findSite('Git Hub').id, 'github');
  assert.equal(findSite('nope-not-a-site'), undefined);
});

test('every example phrase shown in the UI is understood', () => {
  for (const example of EXAMPLES) {
    const p = parseCommand(example);
    assert.ok(['open', 'search', 'close'].includes(p.intent), `${example} -> ${p.intent}`);
  }
});
