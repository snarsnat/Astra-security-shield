/**
 * InputGuard — client-side WAF layer.
 *
 * Detects SQLi, NoSQLi, XSS, and command injection patterns in user inputs
 * before they reach the server. Integrates with ASTRAShield telemetry.
 *
 * Usage:
 *   const guard = new InputGuard({ appToken: '...', onThreat: (r) => { ... } });
 *   guard.protect(formElement);   // auto-validates on submit
 *   guard.scan(inputValue);       // manual scan, returns result
 */
export class InputGuard {
  constructor(options = {}) {
    this.options = options;
    this._protectedForms = new WeakSet();
  }

  // Attach to a <form> element — validates all inputs on submit.
  protect(form) {
    if (!(form instanceof HTMLFormElement)) return;
    if (this._protectedForms.has(form)) return;
    this._protectedForms.add(form);

    form.addEventListener('submit', (e) => {
      const inputs = form.querySelectorAll('input, textarea');
      for (const input of inputs) {
        if (input.type === 'password' || input.type === 'hidden') continue;
        const result = this.scan(input.value);
        if (result.threat) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.options.onThreat?.(result, input);
          this._reportThreat(result);
          return;
        }
      }
    }, { capture: true });
  }

  // Scan a string value. Returns { threat, type, pattern, value }.
  // Tests the raw value AND decoded variants so URL/HTML-encoded payloads
  // (e.g. %3Cscript%3E, &#x3c;script&#x3e;) can't slip past the regexes.
  scan(value) {
    if (!value || typeof value !== 'string') return { threat: false };
    const v = value.trim();
    if (!v) return { threat: false };

    for (const candidate of decodeCandidates(v)) {
      for (const rule of RULES) {
        if (rule.pattern.test(candidate)) {
          return { threat: true, type: rule.type, label: rule.label, value: v.slice(0, 120) };
        }
      }
    }
    return { threat: false };
  }

  _reportThreat(result) {
    if (!this.options.appToken || !this.options.telemetryEndpoint) return;
    const endpoint = this.options.telemetryEndpoint ||
      'https://astra-shield-site.vercel.app/api/events/ingest';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-App-Token': this.options.appToken },
      body: JSON.stringify({
        type: 'blocked',
        reason: result.type,
        attackType: result.type,
        signal: 'input_guard',
      }),
      keepalive: true,
    }).catch(() => {});
  }
}

// Produce decoded variants of a value so encoded payloads are caught.
function decodeCandidates(v) {
  const out = new Set([v]);
  // URL-decode up to twice (double-encoding is a common WAF bypass)
  let cur = v;
  for (let i = 0; i < 2; i++) {
    try {
      const dec = decodeURIComponent(cur.replace(/\+/g, ' '));
      if (dec === cur) break;
      out.add(dec);
      cur = dec;
    } catch { break; }
  }
  // HTML entity decode (numeric + hex), covers &#x3c; / &#60; style encoding
  try {
    const html = v
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
    if (html !== v) out.add(html);
  } catch {}
  return [...out];
}

// ── Detection rules ──────────────────────────────────────────────────────────

const RULES = [
  // ── SQL Injection ──────────────────────────────────────────────────────────
  {
    type: 'sqli',
    label: 'SQL Injection',
    pattern: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|TRUNCATE|REPLACE|MERGE)\b[\s\S]*\b(FROM|INTO|TABLE|DATABASE|WHERE|SET)\b)|('[\s]*OR[\s]*'[\s\d]*'=[\s]*'|'[\s]*OR[\s]*1=1|--[\s]|;[\s]*(DROP|SELECT|INSERT|UPDATE|DELETE)\b|\/\*[\s\S]*?\*\/)/i,
  },
  {
    type: 'sqli',
    label: 'SQL Comment Injection',
    pattern: /(--|#|\/\*|\*\/)[\s\S]*(SELECT|DROP|INSERT|UPDATE|DELETE|EXEC|UNION)/i,
  },
  {
    type: 'sqli',
    label: 'SQLi Boolean Blind',
    pattern: /'\s*(OR|AND)\s*('?\d+'?\s*=\s*'?\d+'?|true|false|\d+=\d+)/i,
  },

  // ── NoSQL Injection ────────────────────────────────────────────────────────
  {
    type: 'nosqli',
    label: 'NoSQL Injection',
    // Allow an optional closing quote/bracket so JSON-style `{"$gt": ...}` is caught
    pattern: /(\$where|\$gt|\$lt|\$gte|\$lte|\$ne|\$in|\$nin|\$or|\$and|\$regex|\$exists|\$type)["'\]]?\s*[:=]/,
  },
  {
    type: 'nosqli',
    label: 'NoSQL JS Injection',
    pattern: /\$where\s*[=:]\s*['"`].*function|this\.\w+\s*==|db\.\w+\.find\(/i,
  },

  // ── XSS ───────────────────────────────────────────────────────────────────
  {
    type: 'xss',
    label: 'XSS Script Tag',
    pattern: /<script[\s>]/i,
  },
  {
    type: 'xss',
    label: 'XSS Event Handler',
    // Anchored to real DOM event-handler names AND a script-like value, so benign
    // identifier assignments like `online = true` no longer false-positive.
    pattern: /\bon(?:error|load|click|mouse\w+|key\w+|focus|blur|change|input|submit|drag\w*|drop|scroll|wheel|touch\w+|pointer\w+|contextmenu|animation\w+|transition\w+|toggle|abort|select|reset|resize|play|pause|ended|canplay|unload|beforeunload|hashchange|popstate|message)\s*=\s*["'`]?\s*(?:[\w$.]+\s*\(|javascript:|data:text\/html|eval\b|alert\b|prompt\b|confirm\b|this\b|document\b|window\b|location\b)/i,
  },
  {
    type: 'xss',
    label: 'XSS javascript: URI',
    pattern: /javascript\s*:/i,
  },
  {
    type: 'xss',
    label: 'XSS Data URI',
    pattern: /data\s*:\s*text\s*\/\s*(html|javascript)/i,
  },
  {
    type: 'xss',
    label: 'XSS Iframe Injection',
    pattern: /<iframe[\s>]/i,
  },
  {
    type: 'xss',
    label: 'XSS SVG Payload',
    pattern: /<svg[\s\S]*?(onload|onerror)\s*=/i,
  },
  {
    type: 'xss',
    label: 'XSS Encoded Payload',
    pattern: /(%3c|&#x?3[cC]|\\x3c|\\u003c)(script|iframe|svg|img)/i,
  },

  // ── Command / Shell Injection ──────────────────────────────────────────────
  {
    type: 'cmdi',
    label: 'Command Injection',
    pattern: /[;&|`$]\s*(ls|cat|rm|wget|curl|nc|bash|sh|python|perl|php|node|exec|system|passthru|popen)\b/i,
  },
  {
    type: 'cmdi',
    label: 'Path Traversal',
    pattern: /(\.\.[\/\\]){2,}|(\.\.[\/\\])*(etc\/passwd|etc\/shadow|proc\/self|windows\/system32)/i,
  },

  // ── LDAP Injection ─────────────────────────────────────────────────────────
  {
    type: 'ldapi',
    label: 'LDAP Injection',
    pattern: /[)(\\*\x00][\s\S]*(objectClass|cn=|uid=|dc=)/i,
  },

  // ── Template Injection ─────────────────────────────────────────────────────
  {
    type: 'ssti',
    label: 'Template Injection',
    pattern: /\{\{[\s\S]*\}\}|\{%[\s\S]*%\}|\${[\s\S]*}|<%[\s\S]*%>/,
  },
];
