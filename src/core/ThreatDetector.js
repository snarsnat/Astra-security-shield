/**
 * ThreatDetector — comprehensive browser-side threat intelligence.
 *
 * Covers: keyloggers, trojans, ransomware, spyware, adware, worms,
 * rootkits, phishing, MitM indicators, DDoS participation, script injection,
 * eval/code-execution abuse, clipboard hijacking, and data exfiltration.
 *
 * All detection is passive — no user-visible effects, no blocking.
 * Reports threat type + score for the OOS engine to act on.
 */
export class ThreatDetector {
  constructor() {
    this.threats = {
      // Malware family
      keyloggerDetected:  false,
      rootkitDetected:    false,
      spywareDetected:    false,
      ransomwareDetected: false,
      adwareDetected:     false,
      wormDetected:       false,
      trojanDetected:     false,

      // Code execution / injection
      scriptInjection:    false,
      evalAbuse:          false,

      // Network / exfil
      dataExfiltration:   false,
      mitm:               false,
      ddosParticipant:    false,

      // Social engineering
      phishing:           false,
      clipboardHijack:    false,
    };

    // Attack type → human-readable label used in dashboard
    this._typeLabels = {
      keyloggerDetected:  'keylogger',
      rootkitDetected:    'rootkit',
      spywareDetected:    'spyware',
      ransomwareDetected: 'ransomware',
      adwareDetected:     'adware',
      wormDetected:       'worm',
      trojanDetected:     'trojan',
      scriptInjection:    'script_injection',
      evalAbuse:          'code_execution',
      dataExfiltration:   'data_exfiltration',
      mitm:               'mitm',
      ddosParticipant:    'ddos',
      phishing:           'phishing',
      clipboardHijack:    'clipboard_hijack',
    };

    // Higher weight = larger OOS boost when detected
    this._weights = {
      keyloggerDetected:  1.0,
      rootkitDetected:    1.0,
      dataExfiltration:   1.0,
      ransomwareDetected: 0.95,
      spywareDetected:    0.90,
      evalAbuse:          0.90,
      trojanDetected:     0.90,
      mitm:               0.90,
      scriptInjection:    0.85,
      phishing:           0.85,
      wormDetected:       0.80,
      ddosParticipant:    0.80,
      adwareDetected:     0.60,
      clipboardHijack:    0.50,
    };

    this._observer = null;
    this._fetchCounter = 0;
    this._fetchWindow = [];
    this._active = false;
    this.injectedScripts = [];
  }

  init() {
    if (this._active || typeof window === 'undefined') return this;
    this._active = true;
    this._checkNativeOverrides();   // rootkit / keylogger / exfil / MitM
    this._checkSpyware();           // camera, mic, screen, geo
    this._checkRansomware();        // file API, crypto API misuse
    this._watchDOMMutations();      // script injection, adware, phishing overlays
    this._watchNetworkFlood();      // DDoS / worm
    this._watchClipboard();         // clipboard hijack
    this._checkPhishing();          // form actions, URL spoofing
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
      'ransomwareDetected',
      'spywareDetected',
      'mitm',
      'trojanDetected',
      'evalAbuse',
      'scriptInjection',
      'phishing',
      'wormDetected',
      'ddosParticipant',
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
