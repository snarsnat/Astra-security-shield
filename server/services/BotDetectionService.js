/**
 * Bot Detection Service — Multi-Layer Bot Detection
 *
 * Detection layers:
 *  1. Headless browser fingerprint detection
 *  2. Automation framework detection (Selenium, Puppeteer, Playwright, CDP)
 *  3. Proxy / VPN / Tor / datacenter IP detection
 *  4. Fingerprint anomaly detection (timezone, language, screen mismatches)
 *  5. Behavioral analysis (mouse, keyboard, scroll, click patterns)
 *  6. Request rate anomaly detection
 *  7. Known bot user-agent / header detection
 *  8. Challenge response analysis
 *  9. Credential stuffing pattern detection
 * 10. Header consistency validation
 */

export class BotDetectionService {
  constructor() {
    // Automation framework UA signatures
    this.automationSignatures = [
      'selenium', 'webdriver', 'puppeteer', 'playwright', 'phantomjs',
      'nightmare', 'casperjs', 'htmlunit', 'headless', ' zombie',
      'mechanize', 'scrapy', 'splash', 'pyppeteer',
    ];

    // Known bot / crawler user-agents (lowercase substrings)
    this.botUserAgents = [
      'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget',
      'python-requests', 'python-urllib', 'python/', 'axios', 'node-fetch',
      'node-http', 'go-http', 'go/', 'java/', 'okhttp', 'libwww',
      'apache-httpclient', 'httpclient', 'perl', 'ruby', 'php/',
      'midpoint', 'aiohttp', 'httpx', 'pycurl', 'cfnetwork',
    ];

    // Headers that should always be present in real browsers
    this.requiredBrowserHeaders = ['accept', 'accept-encoding', 'accept-language'];

    // Headers that indicate automation
    this.automationHeaders = [
      'webdriver', 'x-webdriver', 'selenium-webdriver',
      'phantom-remote', 'x-automated', 'x-bot',
    ];

    // Detection weights — tuned to minimise false positives
    this.weights = {
      headlessBrowser:    0.45,
      automationFramework: 0.55,
      proxyVpnTor:        0.30,
      datacenter:         0.22,
      fingerprintAnomaly: 0.35,
      behaviorAnomaly:    0.40,
      rateAnomaly:        0.38,
      patternAnomaly:     0.45,
      knownBot:           1.00,  // hard block
      headerInconsistency: 0.30,
      credentialStuffing: 0.50,
    };

    // Per-IP request tracking for credential stuffing detection
    this.ipRequestHistory = new Map();

    // Periodic cleanup of stale IP history (every 10 min)
    setInterval(() => this._cleanupIPHistory(), 600_000);
  }

  // ─── Main Entry Point ────────────────────────────────────────────────────────

  async analyze(verificationData) {
    const {
      fingerprints = {},
      behavioralData,
      networkData,
      challengeData,
      sessionData,
      headers = {},
      ip,
    } = verificationData;

    const signals = [];
    let botScore = 0;

    // 1. Known bot / user-agent check (instant hard-block)
    const knownBotResult = this.detectKnownBot(headers);
    if (knownBotResult.isBot) {
      signals.push({ type: 'known_bot', score: 1.0, details: knownBotResult.details });
      botScore = 1.0; // Bypass everything else
    }

    if (botScore < 1.0) {
      // 2. Headless browser detection
      const headlessResult = this.detectHeadlessBrowser(fingerprints, headers);
      if (headlessResult.score > 0) {
        signals.push({ type: 'headless_browser', score: headlessResult.score, details: headlessResult.details });
        botScore += this.weights.headlessBrowser * headlessResult.score;
      }

      // 3. Automation framework detection
      const automationResult = this.detectAutomationFramework(headers, fingerprints);
      if (automationResult.score > 0) {
        signals.push({ type: 'automation_framework', score: automationResult.score, details: automationResult.details });
        botScore += this.weights.automationFramework * automationResult.score;
      }

      // 4. Header consistency check
      const headerResult = this.validateHeaderConsistency(headers);
      if (headerResult.score > 0) {
        signals.push({ type: 'header_inconsistency', score: headerResult.score, details: headerResult.details });
        botScore += this.weights.headerInconsistency * headerResult.score;
      }

      // 5. Proxy / VPN / Tor detection
      const networkResult = this.detectProxyVpnTor(ip, networkData);
      if (networkResult.score > 0) {
        signals.push({ type: 'proxy_vpn_tor', score: networkResult.score, details: networkResult.details });
        botScore += this.weights.proxyVpnTor * networkResult.score;
      }

      // 6. Fingerprint anomaly detection
      const fpResult = this.detectFingerprintAnomalies(fingerprints, sessionData, headers);
      if (fpResult.score > 0) {
        signals.push({ type: 'fingerprint_anomaly', score: fpResult.score, details: fpResult.details });
        botScore += this.weights.fingerprintAnomaly * fpResult.score;
      }

      // 7. Behavioral analysis
      const behaviorResult = this.analyzeBehavior(behavioralData, sessionData);
      if (behaviorResult.score > 0) {
        signals.push({ type: 'behavioral_anomaly', score: behaviorResult.score, details: behaviorResult.details });
        botScore += this.weights.behaviorAnomaly * behaviorResult.score;
      }

      // 8. Rate anomaly detection
      const rateResult = this.analyzeRatePatterns(ip, sessionData, networkData);
      if (rateResult.score > 0) {
        signals.push({ type: 'rate_anomaly', score: rateResult.score, details: rateResult.details });
        botScore += this.weights.rateAnomaly * rateResult.score;
      }

      // 9. Credential stuffing detection
      const csResult = this.detectCredentialStuffing(ip, sessionData);
      if (csResult.score > 0) {
        signals.push({ type: 'credential_stuffing', score: csResult.score, details: csResult.details });
        botScore += this.weights.credentialStuffing * csResult.score;
      }

      // 10. Challenge response analysis
      const challengeResult = this.analyzeChallengeResponse(challengeData);
      if (challengeResult.score > 0) {
        signals.push({ type: 'challenge_failure', score: challengeResult.score, details: challengeResult.details });
        botScore += this.weights.patternAnomaly * challengeResult.score;
      }
    }

    botScore = Math.min(1, botScore);
    const confidence = this.calculateConfidence(signals);
    const decision = this.makeDecision(botScore, confidence, signals);

    return {
      isBot: decision.isBot,
      isSuspicious: decision.isSuspicious,
      botScore,
      riskScore: botScore,
      confidence,
      signals,
      decision,
      riskLevel: this.getRiskLevel(botScore),
      recommendedAction: decision.action,
      details: {
        totalSignals: signals.length,
        criticalSignals: signals.filter(s => s.score > 0.8).length,
        analysisVersion: '3.0',
      },
    };
  }

  // ─── Detection Methods ────────────────────────────────────────────────────────

  detectKnownBot(headers) {
    const details = [];
    const ua = (headers['user-agent'] || '').toLowerCase();

    for (const bot of this.botUserAgents) {
      if (ua.includes(bot)) {
        details.push(`Known bot UA: "${bot}"`);
        return { isBot: true, score: 1.0, details };
      }
    }

    // Empty UA is also a hard block
    if (!ua.trim()) {
      details.push('Empty user-agent');
      return { isBot: true, score: 1.0, details };
    }

    return { isBot: false, score: 0, details };
  }

  detectHeadlessBrowser(fingerprints, headers) {
    const details = [];
    let score = 0;

    const ua = (headers['user-agent'] || '').toLowerCase();

    // Explicit headless Chrome UA
    if (ua.includes('headlesschrome') || ua.includes('headless')) {
      score += 0.95;
      details.push('Headless Chrome UA detected');
    }

    // navigator.webdriver flag (most common headless leak)
    if (fingerprints?.navigator?.webdriver === true) {
      score += 0.95;
      details.push('navigator.webdriver = true');
    }

    // WebGL software renderer (SwiftShader / llvmpipe = headless)
    const renderer = (fingerprints?.webgl?.renderer || '').toLowerCase();
    if (renderer.includes('swiftshader') || renderer.includes('llvmpipe') ||
        renderer.includes('software') || renderer.includes('microsoft basic render')) {
      score += 0.75;
      details.push(`Software WebGL renderer: ${fingerprints.webgl.renderer}`);
    }

    // Missing or empty plugins list (headless doesn't have plugins)
    const plugins = fingerprints?.navigator?.plugins;
    if (plugins !== undefined && (!Array.isArray(plugins) || plugins.length === 0)) {
      score += 0.25;
      details.push('No browser plugins detected');
    }

    // No languages at all
    const langs = fingerprints?.navigator?.languages;
    if (langs !== undefined && (!Array.isArray(langs) || langs.length === 0)) {
      score += 0.30;
      details.push('Empty navigator.languages');
    }

    // Known automation injection properties
    const automationProps = [
      '__webdriver_evaluate', '__selenium_evaluate', '__webdriver_script_function',
      '__fxdriver_evaluate', '__driver_unwrapped', '__webdriver_unwrapped',
      '__lastWatirAlert', '__lastWatirConfirm', '_WEBDRIVER_CLIENT_',
      'cdc_adoQpoasnfa76pfcZLmcfl_Array', 'cdc_adoQpoasnfa76pfcZLmcfl_Promise',
    ];
    for (const prop of automationProps) {
      if (fingerprints?.navigator?.[prop] !== undefined) {
        score += 0.85;
        details.push(`Automation property: ${prop}`);
        break;
      }
    }

    // Notification / geolocation both "denied" in a suspicious combo
    if (fingerprints?.permissions?.notifications === 'denied' &&
        fingerprints?.permissions?.geolocation === 'denied' &&
        fingerprints?.permissions?.camera === 'denied') {
      score += 0.20;
      details.push('All permissions pre-denied (headless pattern)');
    }

    // Canvas: blank or suspiciously short hash
    const canvasHash = fingerprints?.canvas?.hash || '';
    if (canvasHash.length > 0 && canvasHash.length < 20) {
      score += 0.25;
      details.push('Abnormally short canvas fingerprint');
    }

    return { isBot: score > 0.5, score: Math.min(1, score), details };
  }

  detectAutomationFramework(headers, fingerprints) {
    const details = [];
    let score = 0;

    const ua = (headers['user-agent'] || '').toLowerCase();

    // UA-based detection
    for (const sig of this.automationSignatures) {
      if (ua.includes(sig)) {
        score += 0.80;
        details.push(`UA contains automation signature: "${sig}"`);
      }
    }

    // Explicit automation headers
    for (const h of this.automationHeaders) {
      if (headers[h] !== undefined) {
        score += 0.90;
        details.push(`Automation header present: ${h}`);
      }
    }

    // xRequestedWith webdriver
    if ((headers['x-requested-with'] || '').toLowerCase().includes('webdriver')) {
      score += 0.90;
      details.push('x-requested-with: webdriver');
    }

    // Runtime CDP / chrome devtools detection
    if (fingerprints?.runtime?.chrome?.loadTimes !== undefined ||
        fingerprints?.runtime?.csi?.startTime !== undefined) {
      score += 0.65;
      details.push('Chrome automation runtime properties detected');
    }

    // Selenium-specific cookie
    const automationCookies = ['__selenium_evaluate', '__webdriver__', 'webdriver'];
    for (const c of automationCookies) {
      if (fingerprints?.cookies?.[c] !== undefined) {
        score += 0.85;
        details.push(`Automation cookie: ${c}`);
      }
    }

    // navigator.automation array
    if (Array.isArray(fingerprints?.navigator?.automation) &&
        fingerprints.navigator.automation.length > 0) {
      score += 0.80;
      details.push('navigator.automation detected');
    }

    return { isBot: score > 0.5, score: Math.min(1, score), details };
  }

  validateHeaderConsistency(headers) {
    const details = [];
    let score = 0;

    // Missing required browser headers
    const missing = this.requiredBrowserHeaders.filter(h => !headers[h]);
    if (missing.length >= 2) {
      score += 0.35 * (missing.length / this.requiredBrowserHeaders.length);
      details.push(`Missing headers: ${missing.join(', ')}`);
    }

    // Sec-Fetch-* headers missing when Accept is present (real browsers always send both)
    const hasAccept = !!headers['accept'];
    const hasSecFetch = !!(headers['sec-fetch-site'] || headers['sec-fetch-mode']);
    if (hasAccept && !hasSecFetch) {
      score += 0.20;
      details.push('Missing Sec-Fetch-* headers (non-browser client)');
    }

    // User-Agent and Sec-CH-UA mismatch
    const ua = headers['user-agent'] || '';
    const secChUa = headers['sec-ch-ua'] || '';
    if (ua.includes('Chrome') && secChUa && !secChUa.includes('Chromium') && !secChUa.includes('Google')) {
      score += 0.25;
      details.push('User-Agent and Sec-CH-UA inconsistency');
    }

    // Accept header doesn't look like a browser
    const accept = headers['accept'] || '';
    if (accept && !accept.includes('text/html') && !accept.includes('*/*') && !accept.includes('application/json')) {
      score += 0.15;
      details.push('Non-browser Accept header');
    }

    return { score: Math.min(1, score), details };
  }

  detectProxyVpnTor(ip, networkData) {
    const details = [];
    let score = 0;

    if (!networkData) return { score: 0, details };

    if (networkData.isTor) {
      score += 0.85;
      details.push('Tor exit node confirmed');
    }
    if (networkData.isVPN) {
      score += 0.60;
      details.push('VPN detected');
    }
    if (networkData.isProxy) {
      score += 0.55;
      details.push('Proxy detected');
    }
    if (networkData.isDatacenter) {
      score += 0.40;
      details.push('Datacenter IP range');
    }
    if (networkData.abuseScore > 70) {
      score += 0.45;
      details.push(`High abuse score: ${networkData.abuseScore}`);
    }
    if (networkData.asn?.reputation < 40) {
      score += 0.25;
      details.push(`Low-reputation ASN: ${networkData.asn?.number}`);
    }
    if (Array.isArray(networkData.abuseHistory) && networkData.abuseHistory.length > 0) {
      score += Math.min(0.30, networkData.abuseHistory.length * 0.05);
      details.push(`${networkData.abuseHistory.length} abuse reports on record`);
    }

    return { isSuspicious: score > 0.3, score: Math.min(1, score), details };
  }

  detectFingerprintAnomalies(fingerprints, sessionData, headers) {
    const details = [];
    let score = 0;

    if (!fingerprints) return { score: 0, details };

    // Timezone mismatch: client-reported vs Accept-Language implied region
    const fpTz = fingerprints?.timezone?.name || fingerprints?.timezone;
    const acceptLang = (headers['accept-language'] || '').split(',')[0].trim();
    if (fpTz && acceptLang && !this._tzMatchesLang(fpTz, acceptLang)) {
      score += 0.30;
      details.push(`Timezone/language mismatch: ${fpTz} vs ${acceptLang}`);
    }

    // Browser language vs Accept-Language header mismatch
    if (fingerprints?.navigator?.languages && headers['accept-language']) {
      const fpLangs = fingerprints.navigator.languages.map(l => l.toLowerCase().split('-')[0]);
      const headerLangs = headers['accept-language'].split(',').map(l => l.trim().split('-')[0].split(';')[0].toLowerCase());
      const overlap = fpLangs.filter(l => headerLangs.includes(l));
      if (overlap.length === 0 && fpLangs.length > 0 && headerLangs.length > 0) {
        score += 0.45;
        details.push(`Language mismatch: navigator=${fpLangs.join(',')} header=${headerLangs.join(',')}`);
      }
    }

    // Screen resolution from previous session changed dramatically
    if (sessionData?.previousFingerprints?.length > 2) {
      const currentScreen = fingerprints?.hardware?.screen || fingerprints?.screen;
      const prevScreen = sessionData.previousFingerprints[0]?.screen;
      if (currentScreen && prevScreen &&
          (currentScreen.width !== prevScreen.width || currentScreen.height !== prevScreen.height)) {
        score += 0.35;
        details.push('Screen resolution changed between sessions');
      }
    }

    // Mobile UA but no touch support
    const ua = headers['user-agent'] || '';
    const isMobileUA = /mobile|android|iphone|ipad/i.test(ua);
    const maxTouch = fingerprints?.hardware?.maxTouchPoints ?? fingerprints?.navigator?.maxTouchPoints ?? -1;
    if (isMobileUA && maxTouch === 0) {
      score += 0.40;
      details.push('Mobile UA but maxTouchPoints = 0');
    }

    // Desktop UA with touch points > 0 (can be legit touchscreens — low weight)
    if (!isMobileUA && maxTouch > 5) {
      score += 0.10;
      details.push('Desktop UA with high touchPoints (possible spoof)');
    }

    // WebGL renderer vs reported GPU inconsistency
    const webglRenderer = (fingerprints?.webgl?.renderer || '').toLowerCase();
    const reportedGPU = (fingerprints?.hardware?.gpu || '').toLowerCase();
    if (webglRenderer && reportedGPU) {
      const gpuWord = reportedGPU.split(' ')[0];
      if (gpuWord && !webglRenderer.includes(gpuWord)) {
        score += 0.35;
        details.push(`GPU mismatch: WebGL="${fingerprints.webgl.renderer}" vs reported="${fingerprints.hardware.gpu}"`);
      }
    }

    // Impossible hardware concurrency
    const concurrency = fingerprints?.navigator?.hardwareConcurrency;
    if (concurrency !== undefined && (concurrency < 1 || concurrency > 256 || !Number.isInteger(concurrency))) {
      score += 0.30;
      details.push(`Invalid hardwareConcurrency: ${concurrency}`);
    }

    // Device memory out-of-range
    const mem = fingerprints?.navigator?.deviceMemory;
    const validMemory = [0.25, 0.5, 1, 2, 4, 8];
    if (mem !== undefined && !validMemory.includes(mem)) {
      score += 0.25;
      details.push(`Non-standard deviceMemory: ${mem}GB`);
    }

    return { isBot: score > 0.5, score: Math.min(1, score), details };
  }

  analyzeBehavior(behavioralData, sessionData) {
    const details = [];
    let score = 0;

    if (!behavioralData) return { score: 0, details };

    // Mouse movement analysis
    const mouse = behavioralData.mouseMovements || behavioralData.mouse?.positions || [];
    if (mouse.length > 5) {
      const straightness = this._calcStraightness(mouse);
      if (straightness > 0.97) {
        score += 0.55;
        details.push(`Perfect straight-line mouse movement (straightness=${straightness.toFixed(3)})`);
      }

      const velocities = this._calcVelocities(mouse);
      const vVariance = this._variance(velocities);
      if (velocities.length > 10 && vVariance < 0.05) {
        score += 0.45;
        details.push('Perfectly uniform mouse velocity (bot-like)');
      }

      const maxV = Math.max(...velocities);
      if (maxV > 8000) {
        score += 0.45;
        details.push(`Physically impossible mouse speed: ${maxV.toFixed(0)}px/s`);
      }
    }

    // Keystroke dynamics
    const keystrokes = behavioralData.keystrokes || [];
    if (keystrokes.length >= 10) {
      const intervals = keystrokes.slice(1).map((k, i) =>
        (k.timestamp || k.t || 0) - (keystrokes[i].timestamp || keystrokes[i].t || 0)
      ).filter(t => t > 0);

      const stdDev = Math.sqrt(this._variance(intervals));
      if (stdDev < 8) {
        score += 0.45;
        details.push(`Keystroke intervals too uniform (stdDev=${stdDev.toFixed(1)}ms)`);
      }

      // Zero error rate over many keystrokes is suspicious
      const errorKeyCount = keystrokes.filter(k => (k.key || '') === 'Backspace').length;
      if (keystrokes.length > 50 && errorKeyCount === 0) {
        score += 0.25;
        details.push('No typing errors over 50+ keystrokes');
      }
    }

    // Click timing analysis
    const clicks = behavioralData.clicks || [];
    if (clicks.length >= 5) {
      const intervals = clicks.slice(1).map((c, i) =>
        (c.timestamp || c.t || 0) - (clicks[i].timestamp || clicks[i].t || 0)
      ).filter(t => t > 0);
      const cv = Math.sqrt(this._variance(intervals)) / (intervals.reduce((a, b) => a + b, 0) / intervals.length || 1);
      if (cv < 0.05) {
        score += 0.40;
        details.push('Click intervals perfectly regular (robotic)');
      }
    }

    // Scroll analysis
    const scrolls = behavioralData.scrolls || behavioralData.scroll || [];
    if (scrolls.length >= 5) {
      const dists = scrolls.map(s => Math.abs(s.delta || s.dy || 0)).filter(d => d > 0);
      const scrollVariance = this._variance(dists);
      if (scrollVariance < 1 && dists.length > 5) {
        score += 0.30;
        details.push('Scroll deltas perfectly uniform');
      }
    }

    // No interaction at all for a session that submitted data
    if (mouse.length === 0 && keystrokes.length === 0 && clicks.length === 0) {
      score += 0.35;
      details.push('No user interaction events recorded');
    }

    return { isBot: score > 0.4, score: Math.min(1, score), details };
  }

  analyzeRatePatterns(ip, sessionData, networkData) {
    const details = [];
    let score = 0;

    if (!ip) return { score: 0, details };

    // Track per-IP request count
    const now = Date.now();
    const window = 60_000;
    let history = this.ipRequestHistory.get(ip) || [];
    history = history.filter(t => now - t < window);
    history.push(now);
    this.ipRequestHistory.set(ip, history);

    const rpm = history.length;
    if (rpm > 120) {
      score += 0.65;
      details.push(`Very high request rate: ${rpm}/min`);
    } else if (rpm > 60) {
      score += 0.35;
      details.push(`Elevated request rate: ${rpm}/min`);
    }

    // Session-level indicators
    if (sessionData?.requestsPerMinute > 60) {
      score += 0.35;
      details.push(`Session rpm: ${sessionData.requestsPerMinute}`);
    }
    if (sessionData?.pageTimings?.avg < 300) {
      score += 0.38;
      details.push(`Impossibly fast page traversal: avg ${sessionData.pageTimings.avg}ms`);
    }
    if (sessionData?.burstCount > 10) {
      score += 0.25;
      details.push(`Burst pattern: ${sessionData.burstCount} requests`);
    }

    return { isSuspicious: score > 0.3, score: Math.min(1, score), details };
  }

  detectCredentialStuffing(ip, sessionData) {
    const details = [];
    let score = 0;

    if (!sessionData) return { score: 0, details };

    // Multiple login attempts from same IP
    const loginAttempts = sessionData.loginAttempts || 0;
    if (loginAttempts > 5) {
      score += Math.min(0.6, loginAttempts * 0.08);
      details.push(`${loginAttempts} login attempts in session`);
    }

    // Multiple unique account probes (different usernames per IP)
    const uniqueAccounts = sessionData.uniqueAccountsProbed || 0;
    if (uniqueAccounts > 3) {
      score += Math.min(0.7, uniqueAccounts * 0.10);
      details.push(`${uniqueAccounts} unique accounts probed from same IP`);
    }

    // Password spray pattern: many accounts, few attempts each
    if (loginAttempts > 10 && uniqueAccounts > 5 && loginAttempts / uniqueAccounts < 2) {
      score += 0.55;
      details.push('Password spray pattern detected');
    }

    return { score: Math.min(1, score), details };
  }

  analyzeChallengeResponse(challengeData) {
    const details = [];
    let score = 0;

    if (!challengeData) return { score: 0, details };

    if (!challengeData.completed) {
      score += 0.55;
      details.push('Challenge not completed');
    }
    if (challengeData.attempts > 3) {
      score += 0.25;
      details.push(`${challengeData.attempts} challenge attempts`);
    }
    // Sub-200ms completion is physically impossible for a human
    if (challengeData.timing < 200 && challengeData.type !== 'instant_allowed') {
      score += 0.50;
      details.push(`Challenge completed impossibly fast: ${challengeData.timing}ms`);
    }
    if (challengeData.timing > 120_000) {
      score += 0.20;
      details.push('Challenge took extremely long (likely scripted wait)');
    }
    if (challengeData.failurePattern) {
      score += 0.45;
      details.push('Repeating failure pattern in challenge');
    }

    return { isBot: score > 0.5, score: Math.min(1, score), details };
  }

  // ─── Decision & Scoring ───────────────────────────────────────────────────────

  calculateConfidence(signals) {
    if (!signals.length) return 0.2;
    const avg = signals.reduce((s, x) => s + x.score, 0) / signals.length;
    const critical = signals.filter(s => s.score > 0.8).length;
    return Math.min(1, avg + Math.min(0.25, signals.length * 0.03) + critical * 0.10);
  }

  makeDecision(botScore, confidence, signals) {
    // Confirmed bot: high score + high confidence, OR any critical signal
    if ((botScore >= 0.70 && confidence >= 0.65) || botScore >= 0.95) {
      return { isBot: true, isSuspicious: true, action: 'block' };
    }
    // High score but uncertain: challenge
    if (botScore >= 0.45 || (botScore >= 0.30 && confidence >= 0.70)) {
      return { isBot: false, isSuspicious: true, action: 'challenge' };
    }
    // Low-grade suspicion: allow but monitor
    if (botScore >= 0.20) {
      return { isBot: false, isSuspicious: true, action: 'allow_with_tracking' };
    }
    return { isBot: false, isSuspicious: false, action: 'allow' };
  }

  getRiskLevel(score) {
    if (score >= 0.85) return 'critical';
    if (score >= 0.65) return 'high';
    if (score >= 0.40) return 'medium';
    if (score >= 0.20) return 'low';
    return 'minimal';
  }

  // ─── Utilities ────────────────────────────────────────────────────────────────

  _calcVelocities(positions) {
    const v = [];
    for (let i = 1; i < positions.length; i++) {
      const dx = (positions[i].x || 0) - (positions[i-1].x || 0);
      const dy = (positions[i].y || 0) - (positions[i-1].y || 0);
      const dt = (positions[i].t || positions[i].timestamp || 0) - (positions[i-1].t || positions[i-1].timestamp || 0);
      if (dt > 0) v.push(Math.sqrt(dx*dx + dy*dy) / dt * 1000); // px/s
    }
    return v;
  }

  _calcStraightness(positions) {
    if (positions.length < 2) return 0;
    const start = positions[0];
    const end = positions[positions.length - 1];
    const direct = Math.hypot((end.x||0) - (start.x||0), (end.y||0) - (start.y||0));
    let path = 0;
    for (let i = 1; i < positions.length; i++) {
      path += Math.hypot((positions[i].x||0) - (positions[i-1].x||0), (positions[i].y||0) - (positions[i-1].y||0));
    }
    return path > 0 ? direct / path : 0;
  }

  _variance(arr) {
    if (arr.length < 2) return 0;
    const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
  }

  _tzMatchesLang(tz, lang) {
    // Very rough heuristic — prevents false positives from being too strict
    const tzLower = tz.toLowerCase();
    const l = lang.toLowerCase().split('-');
    const region = l[1] || '';
    if (tzLower.includes('america') && ['en', 'es', 'pt', 'fr'].includes(l[0])) return true;
    if (tzLower.includes('europe') && ['en', 'de', 'fr', 'es', 'it', 'pl', 'nl', 'ru'].includes(l[0])) return true;
    if (tzLower.includes('asia') && ['zh', 'ja', 'ko', 'hi', 'ar', 'th', 'vi'].includes(l[0])) return true;
    if (tzLower.includes('pacific') && ['en'].includes(l[0])) return true;
    return true; // Default allow — only flag extreme mismatches
  }

  _cleanupIPHistory() {
    const cutoff = Date.now() - 120_000;
    for (const [ip, times] of this.ipRequestHistory) {
      const fresh = times.filter(t => t > cutoff);
      if (fresh.length === 0) this.ipRequestHistory.delete(ip);
      else this.ipRequestHistory.set(ip, fresh);
    }
  }
}
