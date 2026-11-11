/**
 * Thin wrapper around the browser's Web Speech API (speech -> text) and
 * SpeechSynthesis (text -> speech).
 *
 * Supported: Chrome, Edge, Safari (webkit-prefixed). Not supported: Firefox.
 */

const Recognition = typeof window !== 'undefined'
  ? window.SpeechRecognition || window.webkitSpeechRecognition
  : undefined;

export const isRecognitionSupported = Boolean(Recognition);
export const isSynthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

export const LANGUAGES = [
  { code: 'en-US', label: 'English (United States)' },
  { code: 'en-GB', label: 'English (United Kingdom)' },
  { code: 'en-AU', label: 'English (Australia)' },
  { code: 'en-IN', label: 'English (India)' },
  { code: 'id-ID', label: 'Bahasa Indonesia' },
  { code: 'es-ES', label: 'Español' },
  { code: 'fr-FR', label: 'Français' },
  { code: 'de-DE', label: 'Deutsch' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'ja-JP', label: '日本語' },
];

/** Human-friendly explanations for SpeechRecognition error codes. */
export const ERROR_MESSAGES = {
  'not-allowed': 'Microphone access is blocked. Allow it in the address bar, then try again.',
  'service-not-allowed': 'Speech recognition is blocked for this page. Check your browser settings.',
  'no-speech': "I didn't hear anything. Tap the mic and try again.",
  'audio-capture': 'No microphone found. Plug one in or check your system settings.',
  network: 'Speech recognition needs an internet connection. You can still type commands.',
  'language-not-supported': 'That recognition language is not supported by your browser.',
};

/**
 * @param {{
 *   onStart?: () => void,
 *   onInterim?: (text: string) => void,
 *   onFinal?: (alternatives: string[]) => void,
 *   onError?: (code: string) => void,
 *   onEnd?: () => void,
 * }} handlers
 */
export function createListener(handlers) {
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 4;

  recognition.onstart = () => handlers.onStart?.();

  recognition.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      if (result.isFinal) {
        const alternatives = Array.from(result, (alt) => alt.transcript.trim()).filter(Boolean);
        if (alternatives.length) handlers.onFinal?.(alternatives);
      } else {
        interim += result[0].transcript;
      }
    }
    if (interim) handlers.onInterim?.(interim.trim());
  };

  recognition.onerror = (event) => handlers.onError?.(event.error);
  recognition.onend = () => handlers.onEnd?.();

  return {
    start(lang) {
      recognition.lang = lang;
      recognition.start(); // throws InvalidStateError if already running
    },
    stop() {
      recognition.stop();
    },
    abort() {
      recognition.abort();
    },
  };
}

/** Speak a short reply. Resolves when finished (or immediately if unsupported). */
export function speak(text) {
  return new Promise((resolve) => {
    if (!isSynthesisSupported || !text) {
      resolve();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.05;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    } catch {
      resolve();
    }
  });
}

export function cancelSpeech() {
  try {
    if (isSynthesisSupported) window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}
