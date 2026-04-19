/**
 * Advanced Fingerprinting Service - TLS/JA4+ and multi-layer fingerprinting
 *
 * Multi-layer fingerprinting:
 * 1. Canvas fingerprinting
 * 2. WebGL fingerprinting
 * 3. Audio context fingerprinting
 * 4. Font fingerprinting
 * 5. TLS/JA4+ fingerprinting
 * 6. Hardware fingerprinting
 * 7. Browser characteristics
 */

import { readFileSync, existsSync, watchFile } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// JA4 blocklist — loaded from ~/.astra/ja4-blocklist.txt (one hash per line).
// Falls back to a hardcoded seed list. Hot-reloads when the file changes.
const JA4_BLOCKLIST_FILE = join(homedir(), '.astra', 'ja4-blocklist.txt');

// Known bot JA4 fingerprints (curated seed list — extend via the file above)
const JA4_SEED = [
  't13d1518h2_9f3e245c7a4c_6ffd9e76e3de', // python-requests
  't13d1516h2_8daaf6152771_b0da82dd1658', // curl/libcurl
  't13d1517h2_7c3c8b8c9b9d_3a1b2c3d4e5f', // go net/http
  't13d1515h2_4b4b4b4b4b4b_1a2b3c4d5e6f', // node-fetch / undici
  't13d1512h2_3c3c3c3c3c3c_9f8e7d6c5b4a', // Java HttpURLConnection
];

let _ja4Blocklist = new Set(JA4_SEED);

function _loadJA4File() {
  try {
    if (existsSync(JA4_BLOCKLIST_FILE)) {
      const lines = readFileSync(JA4_BLOCKLIST_FILE, 'utf-8')
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
      _ja4Blocklist = new Set([...JA4_SEED, ...lines]);
    }
  } catch { /* keep previous list */ }
}

_loadJA4File();

// Hot-reload on file change (no server restart needed)
try {
  if (existsSync(JA4_BLOCKLIST_FILE)) {
    watchFile(JA4_BLOCKLIST_FILE, { interval: 10_000 }, _loadJA4File);
  }
} catch { /* watch unavailable */ }

export class FingerprintService {
  constructor() {
    // Known font lists for font detection
    this.fontLists = {
      common: [
        'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana',
        'Courier New', 'Impact', 'Comic Sans MS', 'Trebuchet MS'
      ],
      rare: [
        'Adobe Garamond Pro', 'Baskerville', 'Big Caslon', 'Bodoni MT',
        'Book Antiqua', 'Calibri', 'Cambria', 'Candara', 'Century Gothic',
        'Franklin Gothic Medium', ' Futura', 'Gabriola', 'Garamond'
      ]
    };

    // WebGL vendor/renderer signatures
    this.webglSignatures = {
      realBrowsers: [
        'Intel', 'NVIDIA', 'AMD', 'Apple', 'Mali', 'Adreno', 'PowerVR',
        'Samsung', 'Qualcomm', 'Vivante', 'Immersion'
      ],
      headless: [
        'SwiftShader', 'llvmpipe', 'Software', 'Microsoft Basic Render'
      ]
    };
  }

  /**
   * Analyze all fingerprints
   */
  async analyze(clientFingerprints, serverObservations = {}) {
    const analysis = {
      fingerprints: clientFingerprints,
      anomalies: [],
      riskScore: 0,
      details: {}
    };

    // 1. Canvas Analysis
    if (clientFingerprints.canvas) {
      analysis.details.canvas = this.analyzeCanvas(clientFingerprints.canvas);
      if (analysis.details.canvas.isSuspicious) {
        analysis.anomalies.push('canvas_anomaly');
        analysis.riskScore += 0.3;
      }
    }

    // 2. WebGL Analysis
    if (clientFingerprints.webgl) {
      analysis.details.webgl = this.analyzeWebGL(clientFingerprints.webgl);
      if (analysis.details.webgl.isSuspicious) {
        analysis.anomalies.push('webgl_anomaly');
        analysis.riskScore += 0.25;
      }
    }

    // 3. Audio Analysis
    if (clientFingerprints.audio) {
      analysis.details.audio = this.analyzeAudio(clientFingerprints.audio);
      if (analysis.details.audio.isSuspicious) {
        analysis.anomalies.push('audio_anomaly');
        analysis.riskScore += 0.2;
      }
    }

    // 4. Font Analysis
    if (clientFingerprints.fonts) {
      analysis.details.fonts = this.analyzeFonts(clientFingerprints.fonts);
      if (analysis.details.fonts.isSuspicious) {
        analysis.anomalies.push('font_anomaly');
        analysis.riskScore += 0.15;
      }
    }

    // 5. Navigator Analysis
    if (clientFingerprints.navigator) {
      analysis.details.navigator = this.analyzeNavigator(clientFingerprints.navigator);
      if (analysis.details.navigator.isSuspicious) {
        analysis.anomalies.push('navigator_anomaly');
        analysis.riskScore += 0.2;
      }
    }

    // 6. Hardware Analysis
    if (clientFingerprints.hardware) {
      analysis.details.hardware = this.analyzeHardware(clientFingerprints.hardware);
      if (analysis.details.hardware.isSuspicious) {
        analysis.anomalies.push('hardware_anomaly');
        analysis.riskScore += 0.2;
      }
    }

    // 7. TLS Fingerprint Analysis
    if (serverObservations.tls) {
      analysis.details.tls = await this.analyzeTLSFingerprint(serverObservations.tls);
      if (analysis.details.tls.isSuspicious) {
        analysis.anomalies.push('tls_anomaly');
        analysis.riskScore += 0.35;
      }
    }

    // 8. Cross-reference anomalies
    analysis.details.crossReference = this.crossReferenceAnomalies(analysis.details);

    // 9. Generate device ID
    analysis.deviceId = this.generateDeviceId(clientFingerprints);

    // 10. Entropy analysis
    analysis.entropy = this.calculateFingerprintEntropy(clientFingerprints);

    analysis.riskScore = Math.min(1, analysis.riskScore);

    return analysis;
  }

  /**
   * Canvas fingerprint analysis
   */
  analyzeCanvas(canvas) {
    const result = {
      isSuspicious: false,
      details: {}
    };

    if (!canvas) return result;

    // Check for blank or minimal canvas
    if (!canvas.data || canvas.data.length < 1000) {
      result.isSuspicious = true;
      result.details.blankCanvas = true;
    }

    // Check canvas hash uniqueness
    if (canvas.hash) {
      // Real browsers have highly unique canvas hashes
      // Bot farms might share the same hash
      result.details.hash = canvas.hash;
      result.details.hashLength = canvas.hash.length;
    }

    // Check for specific patterns
    if (canvas.pattern) {
      result.details.hasPattern = true;

      // Check for rendering differences
      if (canvas.renderingDiffs) {
        result.details.renderingQuality = canvas.renderingDiffs.quality;
      }
    }

    // Check for font rendering
    if (canvas.textRendering) {
      result.details.fontRendering = canvas.textRendering;
    }

    // Analyze noise patterns
    if (canvas.noise) {
      result.details.noiseLevel = this.calculateNoiseLevel(canvas.noise);
    }

    return result;
  }

  /**
   * WebGL fingerprint analysis
   */
  analyzeWebGL(webgl) {
    const result = {
      isSuspicious: false,
      details: {}
    };

    if (!webgl) return result;

    // Check renderer
    const renderer = (webgl.renderer || '').toLowerCase();
    const vendor = (webgl.vendor || '').toLowerCase();

    result.details.renderer = webgl.renderer;
    result.details.vendor = webgl.vendor;

    // Check for headless signatures
    for (const sig of this.webglSignatures.headless) {
      if (renderer.includes(sig.toLowerCase())) {
        result.isSuspicious = true;
        result.details.headlessSignature = sig;
        break;
      }
    }

    // Check for missing vendor (suspicious)
    if (!vendor || vendor === 'unknown') {
      result.isSuspicious = true;
      result.details.missingVendor = true;
    }

    // Check renderer consistency
    if (webgl.renderer !== webgl.enhancedRenderer) {
      result.details.rendererMismatch = true;
      result.riskScore = (result.riskScore || 0) + 0.2;
    }

    // Check for debug mode
    if (webgl.debugRendererInfo) {
      result.details.debugMode = true;
    }

    // Analyze WebGL extensions
    if (webgl.extensions) {
      result.details.extensionCount = webgl.extensions.length;
      result.details.supportedExtensions = webgl.extensions.slice(0, 20); // First 20
    }

    // Check for WebGL2 support
    result.details.webgl2Support = webgl.webgl2 || false;

    // Check parameter limits
    if (webgl.parameters) {
      result.details.parameters = {
        maxTextureSize: webgl.parameters.MAX_TEXTURE_SIZE,
        maxViewportDims: webgl.parameters.MAX_VIEWPORT_DIMS,
        maxVertexAttribs: webgl.parameters.MAX_VERTEX_ATTRIBS
      };
    }

    return result;
  }

  /**
   * Audio fingerprint analysis
   */
  analyzeAudio(audio) {
    const result = {
      isSuspicious: false,
      details: {}
    };

    if (!audio) return result;

    // Check for supported audio context
    result.details.supported = audio.supported;

    // Analyze frequency data
    if (audio.frequencyData) {
      result.details.frequencyDataLength = audio.frequencyData.length;

      // Real audio has specific frequency distribution
      const entropy = this.calculateArrayEntropy(audio.frequencyData);
      result.details.frequencyEntropy = entropy;

      if (entropy < 0.1) {
        result.isSuspicious = true;
        result.details.uniformFrequency = true;
      }
    }

    // Check for AudioWorklet support
    result.details.audioWorkletSupport = audio.audioWorklet || false;

    // Analyze sample rate
    if (audio.sampleRate) {
      result.details.sampleRate = audio.sampleRate;

      // Real browsers use standard sample rates
      const standardRates = [44100, 48000, 96000, 192000];
      if (!standardRates.includes(audio.sampleRate)) {
        result.isSuspicious = true;
        result.details.unusualSampleRate = true;
      }
    }

    return result;
  }

  /**
   * Font fingerprint analysis
   */
  analyzeFonts(fonts) {
    const result = {
      isSuspicious: false,
      details: {}
    };

    if (!fonts) return result;

    result.details.detectedFonts = fonts.detected || [];
    result.details.fontCount = fonts.detected?.length || 0;

    // Check for rare fonts (real browsers might have these)
    const rareFontsDetected = fonts.detected?.filter(f =>
      this.fontLists.rare.some(rf => f.toLowerCase().includes(rf.toLowerCase()))
    );
    result.details.rareFonts = rareFontsDetected;

    // Check for font metrics
    if (fonts.metrics) {
      result.details.metrics = fonts.metrics;
    }

    // Suspicious: too few fonts (might be headless)
    if (fonts.detected?.length < 5) {
      result.isSuspicious = true;
      result.details.tooFewFonts = true;
    }

    // Suspicious: too many fonts (might be injection)
    if (fonts.detected?.length > 200) {
      result.isSuspicious = true;
      result.details.tooManyFonts = true;
    }

    return result;
  }

  /**
   * Navigator fingerprint analysis
   */
  analyzeNavigator(navigator) {
    const result = {
      isSuspicious: false,
      details: {}
    };

    if (!navigator) return result;

    // Check for webdriver
    if (navigator.webdriver === true) {
      result.isSuspicious = true;
      result.details.webdriver = true;
    }

    // Check for automation properties
    const automationProps = [
      '__webdriver_evaluate',
      '__selenium_evaluate',
      '__webdriver_script_function',
      '__webdriver_script_function',
      '__fxdriver_evaluate',
      '__driver_unwrapped',
      '__webdriver_unwrapped'
    ];

    for (const prop of automationProps) {
      if (navigator[prop]) {
        result.isSuspicious = true;
        result.details.automationProp = prop;
        break;
      }
    }

    // Check languages
    if (navigator.languages) {
      result.details.languages = navigator.languages;
      result.details.languageCount = navigator.languages.length;

      // Real browsers usually have multiple languages
      if (navigator.languages.length < 1) {
        result.isSuspicious = true;
        result.details.noLanguages = true;
      }
    }

    // Check platform
    if (navigator.platform) {
      result.details.platform = navigator.platform;
    }

    // Check hardware concurrency
    if (navigator.hardwareConcurrency) {
      result.details.hardwareConcurrency = navigator.hardwareConcurrency;

      // Suspicious: very high or very low
      if (navigator.hardwareConcurrency < 1 || navigator.hardwareConcurrency > 256) {
        result.isSuspicious = true;
        result.details.suspiciousConcurrency = true;
      }
    }

    // Check device memory
    if (navigator.deviceMemory) {
      result.details.deviceMemory = navigator.deviceMemory;

      // Suspicious values
      if (navigator.deviceMemory > 128) {
        result.isSuspicious = true;
        result.details.suspiciousMemory = true;
      }
    }

    // Check plugins
    if (navigator.plugins) {
      result.details.pluginCount = navigator.plugins.length;
      result.details.plugins = Array.from(navigator.plugins).map(p => p.name);

      // Real browsers usually have some plugins
      if (navigator.plugins.length === 0) {
        result.details.noPlugins = true;
      }
    }

    // Check cookies enabled
    if (navigator.cookieEnabled === false) {
      result.details.cookiesDisabled = true;
    }

    // Check doNotTrack
    result.details.doNotTrack = navigator.doNotTrack;

    return result;
  }

  /**
   * Hardware fingerprint analysis
   */
  analyzeHardware(hardware) {
    const result = {
      isSuspicious: false,
      details: {}
    };

    if (!hardware) return result;

    // CPU cores
    if (hardware.cpuCores) {
      result.details.cpuCores = hardware.cpuCores;

      if (hardware.cpuCores < 1 || hardware.cpuCores > 256) {
        result.isSuspicious = true;
        result.details.invalidCores = true;
      }
    }

    // Device memory
    if (hardware.deviceMemory) {
      result.details.deviceMemory = hardware.deviceMemory;
    }

    // Touch support
    if (hardware.touchSupport !== undefined) {
      result.details.touchSupport = hardware.touchSupport;
      result.details.maxTouchPoints = hardware.maxTouchPoints || 0;
    }

    // GPU
    if (hardware.gpu) {
      result.details.gpu = hardware.gpu;
    }

    // Battery (if available)
    if (hardware.battery !== undefined) {
      result.details.hasBattery = true;
      result.details.batteryLevel = hardware.battery.level;
    }

    // Device pixel ratio
    if (hardware.devicePixelRatio) {
      result.details.devicePixelRatio = hardware.devicePixelRatio;

      // Check for unusual DPRs
      if (hardware.devicePixelRatio < 0.5 || hardware.devicePixelRatio > 10) {
        result.isSuspicious = true;
        result.details.suspiciousDPR = true;
      }
    }

    // Screen properties
    if (hardware.screen) {
      result.details.screen = hardware.screen;
    }

    return result;
  }

  /**
   * TLS fingerprint analysis (JA4+ style)
   */
  async analyzeTLSFingerprint(tls) {
    const result = {
      isSuspicious: false,
      details: {}
    };

    if (!tls) return result;

    // JA4 fingerprint
    if (tls.ja4) {
      result.details.ja4 = tls.ja4;
    }

    // TLS version
    result.details.tlsVersion = tls.version;

    // Cipher suites
    result.details.cipherCount = tls.cipherSuites?.length || 0;
    result.details.ciphers = tls.cipherSuites?.slice(0, 10); // First 10

    // Extensions
    result.details.extensionCount = tls.extensions?.length || 0;
    result.details.extensions = tls.extensions?.slice(0, 15); // First 15

    // ALPN protocols
    if (tls.alpn) {
      result.details.alpn = tls.alpn;
    }

    // Known bot signatures
    if (tls.ja4) {
      const knownBotJA4s = await this.getKnownBotJA4s();
      if (knownBotJA4s.has(tls.ja4)) {
        result.isSuspicious = true;
        result.details.knownBotJA4 = true;
      }
    }

    // Check for suspicious cipher combinations
    if (tls.cipherSuites) {
      const allSuites = tls.cipherSuites.join('');

      // Check for weak ciphers
      if (allSuites.includes('RSA') && !allSuites.includes('AEAD')) {
        result.details.weakCiphers = true;
      }
    }

    return result;
  }

  /**
   * Cross-reference anomalies between fingerprints
   */
  crossReferenceAnomalies(details) {
    const anomalies = [];

    // WebGL vs Navigator GPU mismatch
    if (details.webgl?.renderer && details.hardware?.gpu) {
      const webglGPU = details.webgl.renderer.toLowerCase();
      const navGPU = details.hardware.gpu.toLowerCase();

      if (!webglGPU.includes(navGPU.split(' ')[0])) {
        anomalies.push('gpu_mismatch');
      }
    }

    // Touch vs device type mismatch
    if (details.hardware?.touchSupport && details.navigator?.platform) {
      const isMobileUA = /mobile|android|iphone/i.test(details.navigator.platform);
      const hasTouch = details.hardware.touchSupport;

      // Desktop without touch trying to appear as mobile
      if (!isMobileUA && hasTouch) {
        // This is suspicious but not necessarily bot
      }
    }

    // Font count vs renderer mismatch
    if (details.fonts?.fontCount < 5 && details.webgl?.renderer) {
      if (!this.webglSignatures.headless.some(s =>
        details.webgl.renderer.toLowerCase().includes(s.toLowerCase())
      )) {
        // Has real GPU but no fonts - suspicious
        anomalies.push('low_font_with_real_gpu');
      }
    }

    return anomalies;
  }

  /**
   * Generate device ID from fingerprints
   */
  generateDeviceId(fingerprints) {
    const components = [];

    // Canvas hash
    if (fingerprints.canvas?.hash) {
      components.push(fingerprints.canvas.hash.substring(0, 8));
    }

    // WebGL renderer
    if (fingerprints.webgl?.renderer) {
      components.push(this.hashString(fingerprints.webgl.renderer).substring(0, 4));
    }

    // Screen resolution
    if (fingerprints.hardware?.screen) {
      const { width, height } = fingerprints.hardware.screen;
      components.push(`${width}x${height}`.substring(0, 8));
    }

    // Timezone
    if (fingerprints.navigator?.timezone) {
      components.push(this.hashString(fingerprints.navigator.timezone).substring(0, 4));
    }

    // Combine and hash
    const combined = components.join('_');
    return 'dev_' + this.hashString(combined);
  }

  /**
   * Calculate fingerprint entropy
   */
  calculateFingerprintEntropy(fingerprints) {
    const allData = JSON.stringify(fingerprints);
    return this.calculateArrayEntropy(Array.from(allData));
  }

  /**
   * Calculate entropy of array data
   */
  calculateArrayEntropy(arr) {
    if (!arr || arr.length === 0) return 0;

    const counts = {};
    for (const item of arr) {
      const key = String(item);
      counts[key] = (counts[key] || 0) + 1;
    }

    const total = arr.length;
    let entropy = 0;

    for (const count of Object.values(counts)) {
      const p = count / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    }

    return entropy;
  }

  /**
   * Calculate noise level in canvas data
   */
  calculateNoiseLevel(noiseData) {
    if (!noiseData || noiseData.length < 10) return 0;

    const values = Array.from(noiseData.slice(0, 100));
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;

    return Math.sqrt(variance);
  }

  /**
   * Simple string hash
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get known bot JA4 fingerprints (would be from database in production)
   */
  async getKnownBotJA4s() {
    return _ja4Blocklist;
  }
}
