/**
 * ScriptMonitor — runtime script behavior profiling and drift detection.
 *
 * Builds a trusted baseline at page load:
 *  - All scripts present on load → trusted
 *  - All network destinations contacted in first 2s → baseline domains
 *  - All form fields present on load → baseline
 *
 * Detects drift:
 *  - New external scripts injected after load → supply chain / Magecart signal
 *  - POST to a domain not in baseline after sensitive field interaction → exfil
 *  - navigator.sendBeacon called after password/card field input → Magecart
 *  - Rapid value reads on sensitive fields (> 3 per second) → harvesting
 *  - New Web Workers spawned → potential cryptominer or worm replication
 */
export class ScriptMonitor {
  constructor() {
    this._trustedScripts   = new Set();   // baseline src URLs
    this._baselineDomains  = new Set();   // domains seen in first 2s
    this._violations       = [];
    this._active           = false;
    this._baselineWindow   = 2000;        // ms to establish baseline
    this._startTime        = 0;
    this._fieldReads       = new Map();   // fieldId → timestamps[]
    this._hadSensitiveInput = false;
    this._workerCount      = 0;
  }

  init() {
    if (this._active || typeof window === 'undefined') return this;
    this._active    = true;
    this._startTime = Date.now();

    this._inventoryBaseline();
    this._watchNewScripts();
    this._watchSendBeacon();
    this._patchSensitiveFields();
    this._watchWorkers();
    this._watchNetworkDrift();

    return this;
  }

  // ── Baseline inventory ───────────────────────────────────────────────────

  _inventoryBaseline() {
    if (typeof document === 'undefined') return;
    // Trust all scripts present at init
    for (const s of document.querySelectorAll('script[src]')) {
      if (s.src) this._trustedScripts.add(s.src);
    }
    // Trust current origin
    this._baselineDomains.add(location.hostname);
  }

  // ── Watch for new injected scripts ──────────────────────────────────────

  _watchNewScripts() {
    if (typeof MutationObserver === 'undefined') return;
    const obs = new MutationObserver(mutations => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.nodeName === 'SCRIPT' && node.src) {
            if (!this._trustedScripts.has(node.src)) {
              // New external script injected after page load
              this._flag('injected_script', { src: node.src });
            }
          }
        }
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  // ── sendBeacon exfil detection ───────────────────────────────────────────
  // Magecart frequently uses navigator.sendBeacon to POST stolen card data
  // to a remote server because it fires even during page unload.

  _watchSendBeacon() {
    if (!navigator.sendBeacon) return;
    const self = this;
    const orig = navigator.sendBeacon.bind(navigator);

    navigator.sendBeacon = function(url, data) {
      try {
        const host = new URL(url).hostname;
        if (!self._baselineDomains.has(host) && !host.endsWith('.' + location.hostname)) {
          if (self._hadSensitiveInput) {
            // sendBeacon to unknown domain AFTER sensitive field input = Magecart exfil
            self._flag('sendbeacon_exfil', { host, hadSensitiveInput: true });
          } else {
            self._flag('sendbeacon_new_domain', { host });
          }
        }
      } catch {}
      return orig(url, data);
    };
  }

  // ── Sensitive field value access monitoring ──────────────────────────────
  // Patches individual sensitive input elements to count value reads.
  // Magecart reads .value in a keydown/input listener loop.

  _patchSensitiveFields() {
    if (typeof document === 'undefined') return;
    const self = this;

    const patch = (el) => {
      if (el._astraMonitored) return;
      el._astraMonitored = true;

      const proto = HTMLInputElement.prototype;
      const desc  = Object.getOwnPropertyDescriptor(proto, 'value');
      if (!desc?.get) return;

      const fieldId = el.name || el.id || el.type || 'unknown';

      Object.defineProperty(el, 'value', {
        get() {
          self._recordFieldRead(fieldId);
          return desc.get.call(this);
        },
        set(v) {
          if (v) self._hadSensitiveInput = true;
          return desc.set.call(this, v);
        },
        configurable: true,
        enumerable:   true,
      });
    };

    // Patch existing fields
    const sel = 'input[type=password], input[name*=card], input[name*=cvv], input[name*=cc]';
    for (const el of document.querySelectorAll(sel)) patch(el);

    // Patch dynamically added fields
    document.addEventListener('focusin', e => {
      const el = e.target;
      if (el instanceof HTMLInputElement &&
          (el.type === 'password' || /card|cvv|cc[-_]/.test(el.name || ''))) {
        patch(el);
        self._hadSensitiveInput = true;
      }
    }, { passive: true });
  }

  _recordFieldRead(fieldId) {
    const now = Date.now();
    const times = (this._fieldReads.get(fieldId) || []).filter(t => now - t < 1000);
    times.push(now);
    this._fieldReads.set(fieldId, times);
    // > 3 reads per second on a password/card field = harvesting script
    if (times.length > 3) {
      this._flag('field_harvesting', { field: fieldId, readsPerSecond: times.length });
    }
  }

  // ── Worker spawn tracking ────────────────────────────────────────────────
  // Cryptominers and worms spawn Web Workers for parallel execution.

  _watchWorkers() {
    if (typeof Worker === 'undefined') return;
    const self = this;
    const OrigWorker = Worker;

    window.Worker = function(url, opts) {
      self._workerCount++;
      const urlStr = typeof url === 'string' ? url : url?.toString?.() || '';
      // Blob-URL worker = code executed entirely in memory, no disk trace
      if (urlStr.startsWith('blob:') && self._workerCount > 2) {
        self._flag('blob_worker_spawn', { count: self._workerCount, url: urlStr.slice(0, 60) });
      }
      // More than 4 workers spawned = likely cryptominer thread pool
      if (self._workerCount > 4) {
        self._flag('worker_flood', { count: self._workerCount });
      }
      return new OrigWorker(url, opts);
    };
    Object.setPrototypeOf(window.Worker, OrigWorker);
    window.Worker.prototype = OrigWorker.prototype;
  }

  // ── Network baseline drift ───────────────────────────────────────────────
  // Establish trusted domains in first 2s. Flag new domains contacted later,
  // especially if sensitive field interaction preceded the request.

  _watchNetworkDrift() {
    if (typeof window === 'undefined' || !window.fetch) return;
    const self = this;
    const ownHost = location.hostname;
    const origFetch = window.fetch;

    window.fetch = function(input, init = {}) {
      try {
        const url = typeof input === 'string' ? input : (input?.url || '');
        const host = url ? (() => { try { return new URL(url).hostname; } catch { return null; } })() : null;

        if (host && host !== ownHost) {
          if (Date.now() - self._startTime < self._baselineWindow) {
            // Within baseline window — add to trusted domains
            self._baselineDomains.add(host);
          } else if (!self._baselineDomains.has(host)) {
            const method = (init.method || 'GET').toUpperCase();
            if (method === 'POST' && self._hadSensitiveInput) {
              self._flag('post_new_domain_after_input', { host });
            } else {
              self._flag('new_domain', { host, method });
            }
          }
        }
      } catch {}
      return origFetch.apply(window, arguments);
    };
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  _flag(type, data = {}) {
    this._violations.push({ type, at: Date.now(), ...data });
  }

  // ── Public API ───────────────────────────────────────────────────────────

  hasViolations() {
    return this._violations.length > 0;
  }

  getViolations() {
    return [...this._violations];
  }

  getWorkerCount() {
    return this._workerCount;
  }

  // Returns primary attack type if detected, null otherwise.
  getAttackType() {
    const types = new Set(this._violations.map(v => v.type));
    if (types.has('sendbeacon_exfil') || types.has('field_harvesting') || types.has('post_new_domain_after_input')) return 'magecart';
    if (types.has('injected_script'))   return 'script_injection';
    if (types.has('worker_flood') || types.has('blob_worker_spawn')) return 'wasm_abuse';
    if (types.has('new_domain'))        return 'domain_hopping';
    return null;
  }

  // 0–1 threat score for OOS integration.
  getScore() {
    const w = {
      sendbeacon_exfil:              1.0,
      field_harvesting:              1.0,
      post_new_domain_after_input:   0.9,
      injected_script:               0.8,
      worker_flood:                  0.7,
      blob_worker_spawn:             0.6,
      sendbeacon_new_domain:         0.5,
      new_domain:                    0.2,
    };
    const raw = this._violations.reduce((sum, v) => sum + (w[v.type] || 0.1), 0);
    return Math.min(1, raw);
  }
}
