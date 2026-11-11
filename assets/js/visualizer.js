/**
 * Radial audio visualizer drawn around the mic orb.
 *
 * While listening it reads the real microphone level (Web Audio AnalyserNode).
 * If the mic stream is unavailable it falls back to a gentle synthetic motion,
 * and when idle it just breathes. The stream is always released on stop.
 */

const BAR_COUNT = 72;
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function parseHex(hex, fallback) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Visualizer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {(level: number) => void} [onLevel] called every frame with 0..1
   */
  constructor(canvas, onLevel) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onLevel = onLevel;
    this.state = 'idle'; // idle | listening
    this.analyser = null;
    this.stream = null;
    this.audioContext = null;
    this.data = null;
    this.frame = 0;
    this.session = 0;
    this.level = 0;
    this.size = 0;
    this.colors = { a: [124, 92, 255], b: [34, 211, 238] };

    this.resize = this.resize.bind(this);
    this.draw = this.draw.bind(this);
    new ResizeObserver(this.resize).observe(canvas);
    this.resize();
  }

  refreshColors() {
    const css = getComputedStyle(document.documentElement);
    this.colors = {
      a: parseHex(css.getPropertyValue('--accent'), this.colors.a),
      b: parseHex(css.getPropertyValue('--accent-2'), this.colors.b),
    };
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.size = rect.width;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.frame) this.paint(performance.now());
  }

  /** Open the microphone for level metering. Safe to call repeatedly. */
  async attachMicrophone() {
    const session = ++this.session;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (session !== this.session) { // stopped while the permission prompt was open
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioCtx();
      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.78;
      source.connect(this.analyser);
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
      this.stream = stream;
    } catch {
      this.analyser = null; // synthetic fallback
    }
  }

  releaseMicrophone() {
    this.session += 1;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
  }

  setState(state) {
    this.state = state;
    if (state === 'listening') this.refreshColors();
  }

  start() {
    this.refreshColors();
    if (!this.frame) this.frame = requestAnimationFrame(this.draw);
  }

  stop() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  draw(now) {
    this.paint(now);
    this.frame = requestAnimationFrame(this.draw);
  }

  paint(now) {
    const { ctx, size } = this;
    if (!size) return;
    ctx.clearRect(0, 0, size, size);

    const reduced = prefersReducedMotion();
    const t = now / 1000;
    const listening = this.state === 'listening';
    if (this.analyser) this.analyser.getByteFrequencyData(this.data);

    let sum = 0;
    const cx = size / 2;
    const cy = size / 2;
    const inner = size * 0.265;
    const maxLen = size * 0.2;

    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(2, size * 0.012);

    for (let i = 0; i < BAR_COUNT; i += 1) {
      const mirrored = i < BAR_COUNT / 2 ? i : BAR_COUNT - 1 - i;
      const pos = mirrored / (BAR_COUNT / 2); // 0..1 from the top, symmetric
      let value;

      if (listening && this.analyser) {
        const bin = 1 + Math.floor(pos * Math.min(this.data.length - 1, 56));
        value = (this.data[bin] / 255) ** 1.15;
      } else if (listening) {
        value = reduced ? 0.25 : 0.25 + 0.25 * Math.sin(t * 5 + i * 0.5) * Math.sin(t * 2.3 + i * 0.21);
      } else {
        value = reduced ? 0.04 : 0.05 + 0.045 * Math.sin(t * 1.4 + i * 0.35);
      }
      value = Math.max(0, Math.min(1, value));
      sum += value;

      const angle = (i / BAR_COUNT) * Math.PI * 2 - Math.PI / 2;
      const len = 3 + value * maxLen;
      const x1 = cx + Math.cos(angle) * inner;
      const y1 = cy + Math.sin(angle) * inner;
      const x2 = cx + Math.cos(angle) * (inner + len);
      const y2 = cy + Math.sin(angle) * (inner + len);

      const mix = 0.5 + 0.5 * Math.sin(angle * 2 + t * (reduced ? 0 : 0.6));
      const [r, g, b] = this.colors.a.map((c, k) => Math.round(c + (this.colors.b[k] - c) * mix));
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${listening ? 0.95 : 0.5})`;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    const target = listening ? Math.min(1, (sum / BAR_COUNT) * 2.2) : 0;
    this.level += (target - this.level) * 0.25;
    this.onLevel?.(this.level);
  }
}
