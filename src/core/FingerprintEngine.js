/**
 * FingerprintEngine — deep browser fingerprinting for headless / automation detection.
 *
 * Real browsers introduce sub-pixel rendering noise in Canvas, platform-specific
 * variation in AudioContext output, and real GPU renderer strings in WebGL.
 * Headless environments are deterministic and render identically every run.
 *
 * Signals:
 *  - Canvas: pixel-level noise variance (headless = zero variance)
 *  - Audio: oscillator frequency hash (known headless hashes flagged)
 *  - WebGL: renderer string (SwiftShader / llvmpipe = software renderer = headless)
 *  - Timing: performance.now() precision (mocked timing = all zeros)
 *  - Screen: impossible geometry (window larger than screen = headless default)
 *  - Hardware: concurrency + memory cross-check with UA claimed capabilities
 */
export class FingerprintEngine {
  constructor() {
    this.data = {};
    this._collected = false;
  }

  async collect() {
    if (this._collected) return this;
    this._collected = true;

    const [canvas, audio, webgl, timing, screen, hardware] = await Promise.allSettled([
      this._canvasFingerprint(),
      this._audioFingerprint(),
      this._webglFingerprint(),
      this._timingFingerprint(),
      this._screenFingerprint(),
      this._hardwareFingerprint(),
    ]);

    this.data = {
      canvas:   canvas.value   || canvas.reason   || {},
      audio:    audio.value    || audio.reason     || {},
      webgl:    webgl.value    || webgl.reason     || {},
      timing:   timing.value   || timing.reason    || {},
      screen:   screen.value   || screen.reason    || {},
      hardware: hardware.value || hardware.reason  || {},
    };

    return this;
  }

  // Real browsers add sub-pixel noise to canvas text rendering.
  // Headless Chrome renders pixel-perfect — zero variance between runs.
  async _canvasFingerprint() {
    if (typeof document === 'undefined') return { isHeadless: false };
    const c = document.createElement('canvas');
    c.width = 240; c.height = 60;
    const ctx = c.getContext('2d');
    if (!ctx) return { isHeadless: false };

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, 240, 60);
    ctx.fillStyle = '#069';
    ctx.font = '11pt "Times New Roman"';
    ctx.fillText('Cwm fjordbank glyphs vext quiz, 😀', 2, 40);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.font = '18pt Arial';
    ctx.fillText('Astra', 4, 58);

    const pixels = ctx.getImageData(0, 0, 240, 60).data;

    // Compute a simple hash
    let hash = 5381;
    for (let i = 0; i < pixels.length; i += 4) {
      hash = ((hash << 5) + hash) ^ pixels[i];
    }

    // Variance across a sample of R-channel values — headless = near zero
    const sample = [];
    for (let i = 0; i < 200; i++) {
      sample.push(pixels[Math.floor(Math.random() * pixels.length / 4) * 4]);
    }
    const mean = sample.reduce((a, b) => a + b, 0) / sample.length;
    const variance = sample.reduce((s, v) => s + (v - mean) ** 2, 0) / sample.length;

    return {
      hash: hash >>> 0,
      variance,
      isHeadless: variance < 1.0,  // pixel-perfect = no rendering noise = headless
    };
  }

  // AudioContext oscillator output is platform-dependent.
  // Known headless AudioContext hashes are flagged directly.
  async _audioFingerprint() {
    if (typeof window === 'undefined') return { isHeadless: false };
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return { isHeadless: true }; // no AudioContext = IoT / stripped browser

    try {
      const ctx   = new AC({ sampleRate: 44100 });
      const osc   = ctx.createOscillator();
      const anl   = ctx.createAnalyser();
      const gain  = ctx.createGain();

      gain.gain.value = 0;
      osc.connect(anl); anl.connect(gain); gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.value = 10000;
      osc.start(0);

      await new Promise(r => setTimeout(r, 25));

      const buf = new Float32Array(anl.frequencyBinCount);
      anl.getFloatFrequencyData(buf);
      osc.stop();
      ctx.close().catch(() => {});

      let hash = 0;
      for (let i = 0; i < buf.length; i++) {
        hash = ((hash << 5) - hash + (buf[i] * 1000 | 0)) | 0;
      }

      // Known headless / automated environment AudioContext hashes
      const HEADLESS_AUDIO = new Set([-709090731, -1420180462, 0, -2147483648]);

      return { hash: hash >>> 0, isHeadless: HEADLESS_AUDIO.has(hash) };
    } catch {
      return { hash: 0, isHeadless: false };
    }
  }

  // Software renderers (SwiftShader, llvmpipe, Mesa SWR) are used in headless/VMs.
  _webglFingerprint() {
    if (typeof document === 'undefined') return { isHeadless: false };
    const c  = document.createElement('canvas');
    const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if (!gl) return { renderer: null, isHeadless: true };

    const ext      = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = ext
      ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    const vendor   = ext
      ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR);

    const SOFT_RENDERERS = /SwiftShader|llvmpipe|Mesa|SWR|VirtualBox|VMware|Parallels|ANGLE.*SwiftShader|Google.*SwiftShader/i;

    return {
      renderer,
      vendor,
      isHeadless: SOFT_RENDERERS.test(renderer || '') || SOFT_RENDERERS.test(vendor || ''),
    };
  }

  // performance.now() resolution varies by browser security settings.
  // If all successive calls return 0 delta, the clock is mocked.
  _timingFingerprint() {
    if (typeof performance === 'undefined') return { isHeadless: false };
    const samples = [];
    for (let i = 0; i < 30; i++) samples.push(performance.now());
    const deltas = samples.slice(1).map((v, i) => v - samples[i]);
    const zeros  = deltas.filter(d => d === 0).length;
    // > 25 zeros = clock is not advancing = mocked environment
    return { zeros, precision: deltas.find(d => d > 0) || 0, isHeadless: zeros > 25 };
  }

  // Headless environments often have screen dimensions that don't match
  // real monitors (e.g., window.innerWidth > screen.width).
  _screenFingerprint() {
    if (typeof window === 'undefined') return { isHeadless: false };
    const checks = {
      windowLargerThanScreen: window.innerWidth > (screen.width || 9999),
      zeroScreenDimensions:   screen.width === 0 || screen.height === 0,
      // Headless Chrome default: screen.colorDepth = 24, but screen.pixelDepth = 24 exactly
      // Real browsers: pixelDepth often differs or both are 32
      suspiciousColorDepth:   screen.colorDepth === 24 && screen.pixelDepth === 24 &&
                              window.devicePixelRatio === 1,
    };
    const isHeadless = checks.windowLargerThanScreen ||
                       checks.zeroScreenDimensions;
    return { ...checks, isHeadless };
  }

  // Cross-check hardware concurrency against UA-claimed browser tier.
  // Puppeteer default: hardwareConcurrency = 2 (can be patched but often isn't).
  _hardwareFingerprint() {
    if (typeof navigator === 'undefined') return { isHeadless: false };
    return {
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory:        navigator.deviceMemory,
      // Concurrency of exactly 2 on a "modern Chrome" UA is a Puppeteer default
      isHeadless: navigator.hardwareConcurrency === 2 &&
                  /Chrome/.test(navigator.userAgent) &&
                  !navigator.deviceMemory,
    };
  }

  // Returns true if two or more deep signals indicate headless/automation.
  isHeadless() {
    const signals = [
      this.data.canvas?.isHeadless,
      this.data.audio?.isHeadless,
      this.data.webgl?.isHeadless,
      this.data.timing?.isHeadless,
      this.data.screen?.isHeadless,
      this.data.hardware?.isHeadless,
    ];
    return signals.filter(Boolean).length >= 2;
  }

  // 0–1 composite headless score.
  getScore() {
    const weights = {
      canvas:   0.25,
      audio:    0.25,
      webgl:    0.25,
      timing:   0.10,
      screen:   0.10,
      hardware: 0.05,
    };
    let score = 0;
    for (const [k, w] of Object.entries(weights)) {
      if (this.data[k]?.isHeadless) score += w;
    }
    return Math.min(1, score);
  }

  getSummary() {
    return {
      canvas:   this.data.canvas,
      audio:    this.data.audio,
      webgl:    { renderer: this.data.webgl?.renderer, isHeadless: this.data.webgl?.isHeadless },
      isHeadless: this.isHeadless(),
      score:    this.getScore(),
    };
  }
}
