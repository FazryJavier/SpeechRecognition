/**
 * Site catalog: every website Voxtab knows by name.
 *
 * - `aliases` are alternative spoken names ("you tube", "stack overflow", ...).
 *   Matching ignores case, spaces and punctuation, so "Stack Overflow" and
 *   "stackoverflow" are the same thing.
 * - `search` is a URL template; `{q}` is replaced by the URL-encoded query.
 *   Sites without a template can only be opened, not searched.
 */

export const SITES = [
  { id: 'youtube', name: 'YouTube', aliases: ['yt', 'you tube'], color: '#ff3b3b',
    home: 'https://www.youtube.com', search: 'https://www.youtube.com/results?search_query={q}' },
  { id: 'google', name: 'Google', aliases: [], color: '#4c8bf5',
    home: 'https://www.google.com', search: 'https://www.google.com/search?q={q}' },
  { id: 'google-images', name: 'Google Images', aliases: ['images', 'image search'], color: '#34a853',
    home: 'https://images.google.com', search: 'https://www.google.com/search?tbm=isch&q={q}' },
  { id: 'google-maps', name: 'Google Maps', aliases: ['maps', 'map'], color: '#ea4335',
    home: 'https://www.google.com/maps', search: 'https://www.google.com/maps/search/{q}' },
  { id: 'google-news', name: 'Google News', aliases: ['news'], color: '#fbbc05',
    home: 'https://news.google.com', search: 'https://news.google.com/search?q={q}' },
  { id: 'google-translate', name: 'Google Translate', aliases: ['translate', 'translator'], color: '#4285f4',
    home: 'https://translate.google.com', search: 'https://translate.google.com/?sl=auto&tl=en&op=translate&text={q}' },
  { id: 'gmail', name: 'Gmail', aliases: ['mail', 'email', 'g mail'], color: '#ea4335',
    home: 'https://mail.google.com', search: 'https://mail.google.com/mail/u/0/#search/{q}' },
  { id: 'google-drive', name: 'Google Drive', aliases: ['drive'], color: '#0f9d58',
    home: 'https://drive.google.com', search: 'https://drive.google.com/drive/search?q={q}' },
  { id: 'google-calendar', name: 'Google Calendar', aliases: ['calendar'], color: '#4285f4',
    home: 'https://calendar.google.com', search: null },
  { id: 'github', name: 'GitHub', aliases: ['git hub'], color: '#8b949e',
    home: 'https://github.com', search: 'https://github.com/search?q={q}' },
  { id: 'stackoverflow', name: 'Stack Overflow', aliases: [], color: '#f48024',
    home: 'https://stackoverflow.com', search: 'https://stackoverflow.com/search?q={q}' },
  { id: 'mdn', name: 'MDN Web Docs', aliases: ['mdn docs', 'mozilla docs'], color: '#83d0f2',
    home: 'https://developer.mozilla.org', search: 'https://developer.mozilla.org/en-US/search?q={q}' },
  { id: 'npm', name: 'npm', aliases: ['npm js'], color: '#cb3837',
    home: 'https://www.npmjs.com', search: 'https://www.npmjs.com/search?q={q}' },
  { id: 'wikipedia', name: 'Wikipedia', aliases: ['wiki'], color: '#9aa4b2',
    home: 'https://en.wikipedia.org', search: 'https://en.wikipedia.org/w/index.php?search={q}' },
  { id: 'reddit', name: 'Reddit', aliases: [], color: '#ff4500',
    home: 'https://www.reddit.com', search: 'https://www.reddit.com/search/?q={q}' },
  { id: 'x', name: 'X', aliases: ['twitter', 'x dot com'], color: '#e7e9ea',
    home: 'https://x.com', search: 'https://x.com/search?q={q}' },
  { id: 'linkedin', name: 'LinkedIn', aliases: ['linked in'], color: '#0a66c2',
    home: 'https://www.linkedin.com', search: 'https://www.linkedin.com/search/results/all/?keywords={q}' },
  { id: 'instagram', name: 'Instagram', aliases: ['insta', 'ig'], color: '#e1306c',
    home: 'https://www.instagram.com', search: null },
  { id: 'facebook', name: 'Facebook', aliases: ['fb'], color: '#1877f2',
    home: 'https://www.facebook.com', search: 'https://www.facebook.com/search/top?q={q}' },
  { id: 'pinterest', name: 'Pinterest', aliases: [], color: '#e60023',
    home: 'https://www.pinterest.com', search: 'https://www.pinterest.com/search/pins/?q={q}' },
  { id: 'tiktok', name: 'TikTok', aliases: ['tik tok'], color: '#25f4ee',
    home: 'https://www.tiktok.com', search: 'https://www.tiktok.com/search?q={q}' },
  { id: 'whatsapp', name: 'WhatsApp Web', aliases: ['whatsapp', 'whats app'], color: '#25d366',
    home: 'https://web.whatsapp.com', search: null },
  { id: 'discord', name: 'Discord', aliases: [], color: '#5865f2',
    home: 'https://discord.com/app', search: null },
  { id: 'spotify', name: 'Spotify', aliases: [], color: '#1db954',
    home: 'https://open.spotify.com', search: 'https://open.spotify.com/search/{q}' },
  { id: 'netflix', name: 'Netflix', aliases: [], color: '#e50914',
    home: 'https://www.netflix.com', search: 'https://www.netflix.com/search?q={q}' },
  { id: 'twitch', name: 'Twitch', aliases: [], color: '#9146ff',
    home: 'https://www.twitch.tv', search: 'https://www.twitch.tv/search?term={q}' },
  { id: 'amazon', name: 'Amazon', aliases: [], color: '#ff9900',
    home: 'https://www.amazon.com', search: 'https://www.amazon.com/s?k={q}' },
  { id: 'tokopedia', name: 'Tokopedia', aliases: ['toko pedia'], color: '#42b549',
    home: 'https://www.tokopedia.com', search: 'https://www.tokopedia.com/search?q={q}' },
  { id: 'notion', name: 'Notion', aliases: [], color: '#d6d6d6',
    home: 'https://www.notion.so', search: null },
  { id: 'figma', name: 'Figma', aliases: [], color: '#a259ff',
    home: 'https://www.figma.com', search: null },
  { id: 'claude', name: 'Claude', aliases: ['claude ai'], color: '#d97757',
    home: 'https://claude.ai', search: null },
  { id: 'chatgpt', name: 'ChatGPT', aliases: ['chat gpt'], color: '#10a37f',
    home: 'https://chatgpt.com', search: null },
  { id: 'duckduckgo', name: 'DuckDuckGo', aliases: ['duck duck go', 'ddg'], color: '#de5833',
    home: 'https://duckduckgo.com', search: 'https://duckduckgo.com/?q={q}' },
  { id: 'bing', name: 'Bing', aliases: [], color: '#008373',
    home: 'https://www.bing.com', search: 'https://www.bing.com/search?q={q}' },
];

/** Collapse a spoken/typed name to a comparable key: "Stack Overflow" -> "stackoverflow". */
export function siteKey(text) {
  return String(text).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

const KEY_TO_SITE = new Map();
for (const site of SITES) {
  for (const label of [site.name, site.id, ...site.aliases]) {
    const key = siteKey(label);
    if (key && !KEY_TO_SITE.has(key)) KEY_TO_SITE.set(key, site);
  }
}

/** Look a site up by any of its names. Returns `undefined` when unknown. */
export function findSite(name) {
  return KEY_TO_SITE.get(siteKey(name));
}

/** Two-letter badge text for a site ("YouTube" -> "Yo"). */
export function siteInitials(site) {
  const letters = site.name.replace(/[^\p{L}\p{N}]/gu, '');
  return letters.length <= 2 ? letters : letters[0].toUpperCase() + letters[1].toLowerCase();
}

export function buildSearchUrl(site, query) {
  if (!site.search) return null;
  return site.search.replace('{q}', encodeURIComponent(query));
}
