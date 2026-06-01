/**
 * ThreatDetector — comprehensive browser-side threat intelligence.
 *
 * Covers: keyloggers, trojans, ransomware, spyware, adware, worms, rootkits,
 * phishing, MitM, DDoS, script/XSS injection, eval/code-execution, clipboard
 * hijacking, data exfiltration, credential stuffing, AI bot detection,
 * IoT botnet fingerprinting, and supply chain integrity violations.
 *
 * Exploitation strategy:
 *  - AI bots: zero timing variance → entropy traps expose them
 *  - IoT botnets: missing browser APIs → capability probe catches them
 *  - Multi-vector campaigns: cross-signal correlation escalates severity
 *
 * All detection is passive — no user-visible effects, no blocking.
 * Reports threat type + score for the OOS engine to act on.
 */
export class ThreatDetector {
  constructor() {
    this.threats = {
      // Malware family
      keyloggerDetected:    false,
      rootkitDetected:      false,
      spywareDetected:      false,
      ransomwareDetected:   false,
      adwareDetected:       false,
      wormDetected:         false,
      trojanDetected:       false,

      // Code execution / injection
      scriptInjection:      false,
      xssAttempt:           false,
      evalAbuse:            false,

      // Network / exfil
      dataExfiltration:     false,
      mitm:                 false,
      ddosParticipant:      false,

      // Auth abuse
      credentialStuffing:   false,
      bruteForce:           false,
      tokenHijack:          false,

      // Modern automation
      aiBotDetected:        false,
      iotBotnetDetected:    false,
      supplyChainViolation: false,

      // Social engineering
      phishing:             false,
      clipboardHijack:      false,
    };

    this._typeLabels = {
      keyloggerDetected:    'keylogger',
      rootkitDetected:      'rootkit',
      spywareDetected:      'spyware',
      ransomwareDetected:   'ransomware',
      adwareDetected:       'adware',
      wormDetected:         'worm',
      trojanDetected:       'trojan',
      scriptInjection:      'script_injection',
      xssAttempt:           'xss',
      evalAbuse:            'code_execution',
      dataExfiltration:     'data_exfiltration',
      mitm:                 'mitm',
      ddosParticipant:      'ddos',
      credentialStuffing:   'credential_stuffing',
      bruteForce:           'brute_force',
      tokenHijack:          'token_hijack',
      aiBotDetected:        'ai_bot',
      iotBotnetDetected:    'iot_botnet',
      supplyChainViolation: 'supply_chain',
      phishing:             'phishing',
      clipboardHijack:      'clipboard_hijack',
    };

    this._weights = {
      keyloggerDetected:    1.0,
      rootkitDetected:      1.0,
      dataExfiltration:     1.0,
      ransomwareDetected:   0.95,
      tokenHijack:          0.95,
      spywareDetected:      0.90,
      evalAbuse:            0.90,
      trojanDetected:       0.90,
      mitm:                 0.90,
      aiBotDetected:        0.90,
      xssAttempt:           0.85,
      scriptInjection:      0.85,
      phishing:             0.85,
      credentialStuffing:   0.85,
      iotBotnetDetected:    0.80,
      wormDetected:         0.80,
      ddosParticipant:      0.80,
      bruteForce:           0.75,
      supplyChainViolation: 0.75,
      adwareDetected:       0.60,
      clipboardHijack:      0.50,
    };

    this._observer = null;
    this._fetchWindow = [];
    this._formSubmitTimes = [];
    this._keystrokeBeforePaste = false;
    this._honeypotTripped = false;
    this._active = false;
    this.injectedScripts = [];

    // Behavioral entropy tracking for AI bot detection
    this._clickTimings = [];
    this._moveAngles = [];
    this._lastClickTime = 0;
    this._lastMoveAngle = null;
  }

  init() {
    if (this._active || typeof window === 'undefined') return this;
    this._active = true;
    this._checkNativeOverrides();     // rootkit / keylogger / exfil / MitM
    this._checkSpyware();             // camera, mic, screen, geo
    this._checkRansomware();          // file API, crypto API misuse
    this._probeIoTCapabilities();     // IoT botnet — missing browser APIs
    this._watchDOMMutations();        // script injection, adware, phishing, XSS
    this._watchNetworkFlood();        // DDoS / worm
    this._watchClipboard();           // clipboard hijack
    this._watchForms();               // credential stuffing, XSS in inputs
    this._checkPhishing();            // form actions, URL spoofing
    this._checkSupplyChain();         // third-party script SRI violations
    this._checkTokenHijack();         // localStorage/cookie token exposure
    this._injectHoneypot();           // invisible trap — AI reads DOM, humans don't
    this._watchBehavioralEntropy();   // AI bots have zero timing variance
    return this;
  }

  // ── Rootkit / Keylogger / MitM / Data Exfiltration ──────────────────────
  _checkNativeOverrides() {
    try {
      // Rootkit: prototype chain poisoning or Object.prototype override
      const nativeHasOwn = Object.prototype.hasOwnProperty.toString();
      if (!nativeHasOwn.includes('[native code]')) this.threats.rootkitDetected = true;

      const nativeDefProp = Object.defineProperty.toString();
      if (!nativeDefProp.includes('[native code]')) this.threats.rootkitDetected = true;

      // Keylogger: addEventListener override intercepts key/input events silently
      if (!EventTarget.prototype.addEventListener.toString().includes('[native code]')) {
        this.threats.keyloggerDetected = true;
      }
      // Keylogger: document.cookie getter override steals session tokens
      const cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') ||
                         Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');
      if (cookieDesc?.get && !cookieDesc.get.toString().includes('[native code]')) {
        this.threats.keyloggerDetected = true;
      }
      // Keylogger: InputEvent data capture override
      const inputValDesc = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      if (inputValDesc?.get && !inputValDesc.get.toString().includes('[native code]')) {
        this.threats.keyloggerDetected = true;
      }

      // Code execution: eval / Function constructor override (shell-like execution)
      if (window.eval && !window.eval.toString().includes('[native code]')) {
        this.threats.evalAbuse = true;
      }
      // setTimeout('string') is a legacy eval vector; override = code injection signal
      if (window.setTimeout && !window.setTimeout.toString().includes('[native code]')) {
        this.threats.evalAbuse = true;
      }

      // Trojan / Data exfiltration: overridden fetch or XHR silently forwards data
      if (window.fetch && !window.fetch.toString().includes('[native code]')) {
        this.threats.dataExfiltration = true;
        this.threats.trojanDetected = true;
      }
      if (XMLHttpRequest.prototype.open && !XMLHttpRequest.prototype.open.toString().includes('[native code]')) {
        this.threats.dataExfiltration = true;
        this.threats.trojanDetected = true;
      }
      if (XMLHttpRequest.prototype.send && !XMLHttpRequest.prototype.send.toString().includes('[native code]')) {
        this.threats.dataExfiltration = true;
      }

      // MitM: WebSocket override — intercepts or re-routes encrypted connections
      if (window.WebSocket && !window.WebSocket.toString().includes('[native code]')) {
        this.threats.mitm = true;
      }

      // MitM: Service Worker can act as a silent proxy for all requests
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations?.().then(regs => {
          if (regs && regs.length > 0) {
            // SW presence alone isn't malicious; flag only if SW scope is '/' (intercepts all)
            for (const reg of regs) {
              if (reg.scope === location.origin + '/') {
                this.threats.mitm = true;
              }
            }
          }
        }).catch(() => {});
      }
    } catch {}
  }

  // ── Spyware: media, geo, screen capture ─────────────────────────────────
  _checkSpyware() {
    if (typeof navigator === 'undefined') return;
    try {
      // Spyware: getUserMedia access (camera/microphone without visible UI)
      if (navigator.mediaDevices?.getUserMedia) {
        const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        const nativeSrc = origGetUserMedia.toString();
        if (!nativeSrc.includes('[native code]')) {
          this.threats.spywareDetected = true;
        }
      }
      // Spyware: getDisplayMedia (screen capture)
      if (navigator.mediaDevices?.getDisplayMedia) {
        const nativeSrc = navigator.mediaDevices.getDisplayMedia.toString();
        if (!nativeSrc.includes('[native code]')) {
          this.threats.spywareDetected = true;
        }
      }
      // Spyware: Geolocation override (harvesting user location silently)
      if (navigator.geolocation?.getCurrentPosition) {
        const nativeSrc = navigator.geolocation.getCurrentPosition.toString();
        if (!nativeSrc.includes('[native code]')) {
          this.threats.spywareDetected = true;
        }
      }
      // Spyware: Clipboard read override (reads clipboard without permission prompt)
      if (navigator.clipboard?.readText) {
        const nativeSrc = navigator.clipboard.readText.toString();
        if (!nativeSrc.includes('[native code]')) {
          this.threats.spywareDetected = true;
          this.threats.clipboardHijack = true;
        }
      }
    } catch {}
  }

  // ── Ransomware: file system API, crypto API abuse ────────────────────────
  _checkRansomware() {
    if (typeof window === 'undefined') return;
    try {
      // Ransomware: File System Access API — writing/encrypting local files
      if (window.showSaveFilePicker || window.showOpenFilePicker || window.showDirectoryPicker) {
        // Presence alone isn't malicious — check if native or overridden
        if (window.showSaveFilePicker && !window.showSaveFilePicker.toString().includes('[native code]')) {
          this.threats.ransomwareDetected = true;
        }
      }
      // Ransomware: Web Crypto subtle.encrypt override — encrypting user data
      if (window.crypto?.subtle?.encrypt) {
        const nativeSrc = window.crypto.subtle.encrypt.toString();
        if (!nativeSrc.includes('[native code]')) {
          this.threats.ransomwareDetected = true;
        }
      }
      // Ransomware: IndexedDB override — mass storage encryption
      if (window.indexedDB?.open && !window.indexedDB.open.toString().includes('[native code]')) {
        this.threats.ransomwareDetected = true;
      }
    } catch {}
  }

  // ── DOM mutations: script injection, adware, trojan overlays ────────────
  _watchDOMMutations() {
    if (typeof MutationObserver === 'undefined') return;
    this._observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          const tag = node.nodeName;

          // Script injection: external scripts from unknown origins
          if (tag === 'SCRIPT') {
            const src = node.src || '';
            if (src && !src.startsWith(location.origin) && !src.startsWith('data:')) {
              this.threats.scriptInjection = true;
              this.injectedScripts.push(src);
            }
            // Inline shell/eval patterns
            const content = node.textContent || '';
            if (/eval\s*\(|new\s+Function\s*\(|atob\s*\(|document\.cookie\s*=|localStorage\.(get|set)Item/.test(content)) {
              this.threats.scriptInjection = true;
              this.threats.evalAbuse = true;
            }
          }

          // Trojan: cross-origin iframes (data harvesting / credential overlay)
          if (tag === 'IFRAME') {
            const src = node.src || '';
            if (src && !src.startsWith(location.origin) && src !== 'about:blank') {
              this.threats.scriptInjection = true;
              this.threats.trojanDetected = true;
            }
          }

          // Adware: full-screen/fixed-position overlay elements injected into body
          if (tag === 'DIV' || tag === 'SECTION' || tag === 'ASIDE') {
            try {
              const style = window.getComputedStyle(node);
              if (
                (style.position === 'fixed' || style.position === 'absolute') &&
                parseInt(style.zIndex || '0') > 99999 &&
                node.offsetWidth > window.innerWidth * 0.5
              ) {
                this.threats.adwareDetected = true;
              }
            } catch {}
          }

          // Phishing: form with external action injected into DOM
          if (tag === 'FORM') {
            const action = node.action || '';
            if (action && !action.startsWith(location.origin) && !action.startsWith('/')) {
              this.threats.phishing = true;
            }
          }
        }
      }
    });
    this._observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'action'] });
  }

  // ── DDoS / Worm: detect this browser being used as a botnet node ─────────
  _watchNetworkFlood() {
    if (typeof window === 'undefined' || !window.fetch) return;
    const FLOOD_WINDOW_MS = 10000;
    const FLOOD_THRESHOLD = 40; // 40+ requests in 10s = DDoS participation
    const origFetch = window.fetch;

    // Wrap fetch to count calls (non-destructive — still calls original)
    window.fetch = (...args) => {
      const now = Date.now();
      this._fetchWindow = this._fetchWindow.filter(t => now - t < FLOOD_WINDOW_MS);
      this._fetchWindow.push(now);
      if (this._fetchWindow.length >= FLOOD_THRESHOLD) {
        this.threats.ddosParticipant = true;
        this.threats.wormDetected = true;
      }
      return origFetch.apply(window, args);
    };

    // Worm: BroadcastChannel messages triggering replication across tabs
    if (typeof BroadcastChannel !== 'undefined') {
      const bc = new BroadcastChannel('__astra_worm_watch__');
      bc.onmessage = (e) => {
        // Worms use BC to command other tabs — suspicious auto-action messages
        if (e.data && typeof e.data === 'object' && (e.data.cmd || e.data.exec || e.data.run)) {
          this.threats.wormDetected = true;
        }
      };
    }
  }

  // ── Clipboard hijack ─────────────────────────────────────────────────────
  _watchClipboard() {
    if (typeof document === 'undefined') return;
    document.addEventListener('copy', e => {
      if (e.defaultPrevented) this.threats.clipboardHijack = true;
    }, { capture: true, passive: true });
    document.addEventListener('cut', e => {
      if (e.defaultPrevented) this.threats.clipboardHijack = true;
    }, { capture: true, passive: true });
  }

  // ── Phishing: form action spoofing, IDN homograph ────────────────────────
  _checkPhishing() {
    if (typeof document === 'undefined') return;
    try {
      // Check existing forms on page load
      for (const form of document.forms) {
        const action = form.action || '';
        if (action && !action.startsWith(location.origin) && !action.startsWith('/') && !action.startsWith('#')) {
          this.threats.phishing = true;
        }
      }
      // IDN homograph: punycode in URL (xn--) is a classic phishing signal
      if (location.hostname.includes('xn--')) {
        this.threats.phishing = true;
      }
    } catch {}
  }

  // ── IoT Botnet: probe for missing browser APIs ──────────────────────────
  // IoT devices (routers, cameras, smart TVs used in botnets) lack WebGL,
  // AudioContext, Web Workers, and modern CSS APIs. We exploit this gap.
  _probeIoTCapabilities() {
    if (typeof window === 'undefined') return;
    let missingCount = 0;
    const checks = [
      () => !window.WebGLRenderingContext,
      () => !window.AudioContext && !window.webkitAudioContext,
      () => !window.Worker,
      () => !window.requestAnimationFrame,
      () => !window.IntersectionObserver,
      () => !window.ResizeObserver,
      () => !window.crypto?.subtle,
      () => !navigator.hardwareConcurrency,
    ];
    for (const check of checks) {
      try { if (check()) missingCount++; } catch {}
    }
    // 4+ missing APIs = IoT/embedded device profile
    if (missingCount >= 4) this.threats.iotBotnetDetected = true;

    // IoT user-agent patterns (TV browsers, router admin UIs, embedded WebKit)
    const ua = navigator.userAgent || '';
    if (/SmartTV|SMART-TV|HbbTV|Tizen|WebOS|NetCast|BRAVIA|Viera|NetRange|OpenTV|DLNADOC/i.test(ua)) {
      this.threats.iotBotnetDetected = true;
    }
    // Headless/bot UA patterns that slip past basic headless checks
    if (/HeadlessChrome|PhantomJS|SlimerJS|Zombie|python-requests|Go-http-client|curl\/|libwww/i.test(ua)) {
      this.threats.aiBotDetected = true;
    }
  }

  // ── AI Bot Detection: behavioral entropy trap ────────────────────────────
  // AI-driven automation tools produce unnaturally precise timing and movement.
  // Real humans have variance. We measure entropy across click intervals and
  // mouse angles — too-uniform = bot, too-random = scripted randomization.
  _watchBehavioralEntropy() {
    if (typeof document === 'undefined') return;

    document.addEventListener('click', () => {
      const now = Date.now();
      if (this._lastClickTime) {
        this._clickTimings.push(now - this._lastClickTime);
        if (this._clickTimings.length > 20) this._clickTimings.shift();
        if (this._clickTimings.length >= 10) this._checkTimingEntropy();
      }
      this._lastClickTime = now;
    }, { passive: true });

    document.addEventListener('mousemove', (e) => {
      if (this._lastMovePos) {
        const dx = e.clientX - this._lastMovePos.x;
        const dy = e.clientY - this._lastMovePos.y;
        if (dx || dy) {
          const angle = Math.atan2(dy, dx);
          this._moveAngles.push(angle);
          if (this._moveAngles.length > 50) this._moveAngles.shift();
        }
      }
      this._lastMovePos = { x: e.clientX, y: e.clientY };
    }, { passive: true });
  }

  _checkTimingEntropy() {
    if (this._clickTimings.length < 10) return;
    const mean = this._clickTimings.reduce((a, b) => a + b, 0) / this._clickTimings.length;
    const variance = this._clickTimings.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / this._clickTimings.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean; // coefficient of variation

    // CV < 0.05: near-zero variance = AI automation (too perfect)
    // CV > 2.5 with mean < 80ms: scripted random timing injection
    if (cv < 0.05 && mean < 2000) this.threats.aiBotDetected = true;
    if (cv > 2.5 && mean < 80)   this.threats.aiBotDetected = true;

    // Check mouse angle variance too — bots move in straight lines
    if (this._moveAngles.length >= 20) {
      const angleVariance = this._computeCircularVariance(this._moveAngles);
      if (angleVariance < 0.02) this.threats.aiBotDetected = true; // perfectly straight paths
    }
  }

  _computeCircularVariance(angles) {
    const sinMean = angles.reduce((s, a) => s + Math.sin(a), 0) / angles.length;
    const cosMean = angles.reduce((s, a) => s + Math.cos(a), 0) / angles.length;
    return 1 - Math.sqrt(sinMean ** 2 + cosMean ** 2);
  }

  // ── Honeypot: invisible field AI bots read and interact with ─────────────
  // AI scrapes DOM to understand form structure. Injects a hidden field with
  // an enticing name. Humans never see or fill it. AI automation often does.
  _injectHoneypot() {
    if (typeof document === 'undefined') return;
    const forms = document.forms;
    if (!forms.length) return;

    for (const form of forms) {
      const trap = document.createElement('input');
      trap.type = 'text';
      trap.name = 'email_confirm';           // enticing to scrapers
      trap.autocomplete = 'off';
      trap.tabIndex = -1;
      trap.setAttribute('aria-hidden', 'true');
      trap.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
      form.appendChild(trap);

      form.addEventListener('submit', () => {
        if (trap.value.trim().length > 0) {
          this.threats.aiBotDetected = true;
          this._honeypotTripped = true;
        }
      }, { passive: true });
    }
  }

  // ── Credential stuffing & brute force: form behavior analysis ───────────
  _watchForms() {
    if (typeof document === 'undefined') return;

    // Track keystroke activity before paste events on password fields
    document.addEventListener('keydown', () => {
      this._keystrokeBeforePaste = true;
    }, { passive: true });

    document.addEventListener('paste', (e) => {
      const target = e.target;
      if (target?.type === 'password' && !this._keystrokeBeforePaste) {
        // Password pasted with zero prior keystrokes = credential stuffing signal
        this.threats.credentialStuffing = true;
      }
      this._keystrokeBeforePaste = false;
    }, { passive: true });

    // Track rapid form submissions (brute force)
    document.addEventListener('submit', () => {
      const now = Date.now();
      this._formSubmitTimes = this._formSubmitTimes.filter(t => now - t < 60000);
      this._formSubmitTimes.push(now);
      if (this._formSubmitTimes.length >= 5) this.threats.bruteForce = true;
      if (this._formSubmitTimes.length >= 10) this.threats.credentialStuffing = true;
    }, { passive: true });

    // Monitor inputs for XSS / SQLi payloads
    document.addEventListener('input', (e) => {
      const val = e.target?.value || '';
      if (this._looksLikeXSS(val))  this.threats.xssAttempt = true;
    }, { passive: true });
  }

  _looksLikeXSS(val) {
    return /<script[\s>]|javascript\s*:|on\w+\s*=|<iframe[\s>]|<img[^>]+onerror|<svg[^>]+onload|data:text\/html|&#x[0-9a-f]+;|%3cscript|\\x3cscript/i.test(val);
  }

  // ── Supply chain integrity: scripts loaded without SRI ───────────────────
  // Compromised CDN scripts are the #1 supply chain attack vector.
  // Any external script lacking a crossorigin+integrity attribute is a risk.
  _checkSupplyChain() {
    if (typeof document === 'undefined') return;
    const scripts = document.querySelectorAll('script[src]');
    for (const s of scripts) {
      const src = s.src || '';
      if (!src.startsWith(location.origin) && !s.integrity) {
        // External script with no SRI = supply chain risk
        this.threats.supplyChainViolation = true;
        break;
      }
    }
  }

  // ── Token hijack: detect localStorage/sessionStorage token exposure ───────
  _checkTokenHijack() {
    if (typeof window === 'undefined') return;
    try {
      // Overridden Storage.getItem = silent token harvesting trojan
      if (
        Storage.prototype.getItem &&
        !Storage.prototype.getItem.toString().includes('[native code]')
      ) {
        this.threats.tokenHijack = true;
        this.threats.trojanDetected = true;
      }
      if (
        Storage.prototype.setItem &&
        !Storage.prototype.setItem.toString().includes('[native code]')
      ) {
        this.threats.tokenHijack = true;
      }
    } catch {}
  }

  // ── Public API ───────────────────────────────────────────────────────────

  getThreats() {
    return { ...this.threats };
  }

  // Returns the highest-severity detected attack type label for dashboard reporting.
  getAttackType() {
    // Priority order: most dangerous first
    const priority = [
      'rootkitDetected',
      'keyloggerDetected',
      'dataExfiltration',
      'tokenHijack',
      'ransomwareDetected',
      'spywareDetected',
      'mitm',
      'trojanDetected',
      'aiBotDetected',
      'evalAbuse',
      'xssAttempt',
      'scriptInjection',
      'phishing',
      'credentialStuffing',
      'iotBotnetDetected',
      'wormDetected',
      'ddosParticipant',
      'bruteForce',
      'supplyChainViolation',
      'adwareDetected',
      'clipboardHijack',
    ];
    for (const key of priority) {
      if (this.threats[key]) return this._typeLabels[key];
    }
    return null;
  }

  // Returns all detected attack types (for multi-threat events).
  getActiveAttackTypes() {
    return Object.entries(this.threats)
      .filter(([, v]) => v)
      .map(([k]) => this._typeLabels[k]);
  }

  // Returns 0–1 combined threat score for OOS engine integration.
  getThreatScore() {
    const raw = Object.entries(this.threats).reduce(
      (sum, [k, v]) => sum + (v ? (this._weights[k] || 0) : 0),
      0
    );
    return Math.min(1, raw);
  }

  destroy() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
    this._active = false;
  }
}
