/**
 * Tiny, defensive localStorage wrapper. Storage can be unavailable (private
 * windows, blocked site data) or contain junk, so every read is validated and
 * every call is wrapped in try/catch. The app must work without it.
 */

const PREFIX = 'voxtab:';

export function load(key, fallback, isValid = () => true) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw);
    return isValid(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Raw string access, used for the theme so theme-init.js can read it without JSON. */
export function loadRaw(key) {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

export function saveRaw(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, value);
  } catch {
    /* ignore */
  }
}
