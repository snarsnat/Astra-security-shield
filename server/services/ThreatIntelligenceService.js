/**
 * Global Threat Intelligence Service
 *
 * Maintains real-time threat intelligence database with:
 * 1. IP reputation scoring
 * 2. ASN-based threat classification
 * 3. Known bot/Crawler signatures
 * 4. Threat actor tracking
 * 5. Geopolitical risk assessment
 * 6. Automatic threat feed updates
 */

import crypto from 'crypto';
import geoip from 'geoip-lite';

// ─── In-process abuse tracker ─────────────────────────────────────────────────
// Populated by detections from BotDetectionService via recordAbuse().
const internalAbuseDB = new Map(); // ip -> { count, lastSeen, reasons[] }
const ABUSE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export class ThreatIntelligenceService {
  constructor(options = {}) {
    this.redis = options.redis || null;
    this.config = {
      cacheTTL: 3600, // 1 hour
      ipReputationWindow: 86400, // 24 hours
      threatFeedRefresh: 300, // 5 minutes
      maxThreatScore: 100,
      minConfidence: 0.5
    };

    // Threat intelligence cache
    this.intelCache = new Map();
    this.threatFeedCache = new Map();

    // Known threat patterns
    this.threatPatterns = {
      // Datacenter IP ranges (high risk for bots)
      datacenterASNs: [
        'AS15169', // Google
        'AS8075',  // Microsoft
        'AS13414', // Facebook
        'AS14618', // Amazon
        'AS26496', // GoDaddy
        'AS16276', // OVH
        'AS24940', // Hetzner
        'AS12876', // Online
        'AS31133', // MegaFon
        'AS45090', // Tencent
        // Add more datacenter/cloud providers
      ],

      // Known VPN providers
      vpnProviders: [
        'nordvpn', 'expressvpn', 'surfshark', 'cyberghost',
        'private internet access', 'ipvanish', 'vyprvpn',
        'hotspotshield', 'protonvpn', 'windscribe',
        'mullvad', 'airvpn', 'btguard', 'torguard'
      ],

      // Known proxy services
      proxyServices: [
        'luminati', 'oxylabs', 'smartproxy', 'geonode',
        'packetstream', 'proxyrack', 'shifter', 'webshare',
        'stormproxies', 'microleaves', 'proxylivery'
      ],

      // Known Tor exit nodes (partial list — real implementation would query a live feed)
      torExitPatterns: [
        'dark', 'exon', 'tor' // Truncated for security
      ],

      // Bot user agent patterns
      botPatterns: [
        /curl/i, /wget/i, /python/i, /requests/i,
        /scrapy/i, /mechanize/i, /selenium/i, /puppeteer/i,
        /playwright/i, /nightmare/i, /phantomjs/i, /headless/i,
        /bot/i, /crawler/i, /spider/i, /scanner/i,
        /httpclient/i, /java\//i, /go-http/i, /axios/i
      ],

      // Suspicious TLDs
      suspiciousTLDs: [
        '.tk', '.ml', '.ga', '.cf', '.gq', // Free TLDs
        '.xyz', '.top', '.club', '.loan', '.work'
      ]
    };

    // Threat categories
    this.threatCategories = {
      BOT: 'bot',
      VPN: 'vpn',
      PROXY: 'proxy',
      TOR: 'tor',
      DATACENTER: 'datacenter',
      SCANNER: 'scanner',
      CRAWLER: 'crawler',
      CREDENTIAL_STUFFER: 'credential_stuffer',
      SCALPER: 'scalper',
      DDoS_SOURCE: 'ddos_source'
    };

    // Threat actors (for enterprise security)
    this.knownThreatActors = {
      'apt28': { risk: 0.9, indicators: [] },
      'apt29': { risk: 0.9, indicators: [] },
      'lazarus': { risk: 0.9, indicators: [] },
      'fancybear': { risk: 0.85, indicators: [] },
      'carbanak': { risk: 0.9, indicators: [] },
      'mudnye': { risk: 0.8, indicators: [] }
    };
  }

  /**
   * Comprehensive threat intelligence lookup
   */
  async getThreatIntelligence(ip, context = {}) {
    const cacheKey = this.getCacheKey(ip);

    // Check cache first
    if (this.intelCache.has(cacheKey)) {
      const cached = this.intelCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.config.cacheTTL * 1000) {
        return cached.data;
      }
    }

    const intelligence = {
      ip,
      reputation: { score: 0, factors: [], category: 'clean' },
      threatCategories: [],
      geoRisk: null,
      asnInfo: null,
      vpnProxyRisk: null,
      historicalThreats: null,
      recommendations: []
    };

    // 1. IP Reputation Analysis
    intelligence.reputation = await this.analyzeIPReputation(ip, context);

    // 2. ASN-based threat assessment
    intelligence.asnInfo = await this.analyzeASN(ip);

    // 3. Geolocation risk assessment
    intelligence.geoRisk = await this.assessGeoRisk(ip, context);

    // 4. VPN/Proxy/Tor detection
    intelligence.vpnProxyRisk = await this.detectVPNProxyTor(ip, intelligence.asnInfo);

    // 5. Historical threat data
    intelligence.historicalThreats = await this.getHistoricalThreats(ip);

    // 6. Cross-reference all signals
    intelligence.threatCategories = this.determineThreatCategories(intelligence);

    // 7. Calculate final reputation score
    intelligence.reputation = this.calculateFinalReputation(intelligence);

    // 8. Generate recommendations
    intelligence.recommendations = this.generateRecommendations(intelligence);

    // Cache the result
    this.intelCache.set(cacheKey, {
      timestamp: Date.now(),
      data: intelligence
    });

    return intelligence;
  }

  /**
   * Analyze IP reputation based on multiple factors
   */
  async analyzeIPReputation(ip, context = {}) {
    const factors = [];
    let totalScore = 0;

    // 1. Check against known bot IPs
    const knownBotIP = await this.checkKnownBotIPs(ip);
    if (knownBotIP.found) {
      factors.push({
        type: 'known_bot_ip',
        score: 50,
        confidence: 0.95,
        details: knownBotIP
      });
      totalScore += 50;
    }

    // 2. Check honeypot databases
    const honeypotCheck = await this.checkHoneypots(ip);
    if (honeypotCheck.isHoneypot) {
      factors.push({
        type: 'honeypot',
        score: 100,
        confidence: 0.99,
        details: honeypotCheck
      });
      totalScore = 100;
    }

    // 3. Check for recent abuse
    const abuseCheck = await this.checkAbuseDatabases(ip);
    if (abuseCheck.recentAbuse) {
      factors.push({
        type: 'recent_abuse',
        score: 40,
        confidence: 0.8,
        details: abuseCheck
      });
      totalScore += 40;
    }

    // 4. Check threat list memberships
    const threatListCheck = await this.checkThreatLists(ip);
    if (threatListCheck.onList) {
      factors.push({
        type: 'threat_list',
        score: threatListCheck.listScore,
        confidence: 0.85,
        details: threatListCheck
      });
      totalScore += threatListCheck.listScore;
    }

    // 5. Check for recent bot activity
    const botActivityCheck = await this.checkRecentBotActivity(ip);
    if (botActivityCheck.recentBotActivity) {
      factors.push({
        type: 'recent_bot_activity',
        score: 35,
        confidence: 0.75,
        details: botActivityCheck
      });
      totalScore += 35;
    }

    // 6. Check for port scanning activity
    const portScanCheck = await this.checkPortScanning(ip);
    if (portScanCheck.hasScanned) {
      factors.push({
        type: 'port_scanning',
        score: 30,
        confidence: 0.7,
        details: portScanCheck
      });
      totalScore += 30;
    }

    return {
      score: Math.min(totalScore, 100),
      factors,
      category: this.categorizeReputation(totalScore)
    };
  }

  /**
   * Check against known bot IP database — uses our internal abuse tracker.
   */
  async checkKnownBotIPs(ip) {
    const now = Date.now();
    const entry = internalAbuseDB.get(ip);
    if (entry && (now - entry.lastSeen) < ABUSE_WINDOW_MS) {
      return { found: true, count: entry.count, reasons: entry.reasons, lastSeen: entry.lastSeen };
    }
    return { found: false, lastSeen: null, botType: null };
  }

  /**
   * Check abuse databases — uses our internal tracker.
   * In production, extend this to call AbuseIPDB / Spamhaus APIs.
   */
  async checkAbuseDatabases(ip) {
    const now = Date.now();
    const entry = internalAbuseDB.get(ip);
    if (entry && (now - entry.lastSeen) < ABUSE_WINDOW_MS && entry.count >= 2) {
      return {
        recentAbuse: true,
        abuseTypes: entry.reasons,
        lastReported: new Date(entry.lastSeen).toISOString(),
        reportCount: entry.count,
      };
    }
    return { recentAbuse: false, abuseTypes: [], lastReported: null, reportCount: 0 };
  }

  /**
   * Check against threat lists
   */
  async checkThreatLists(ip) {
    // In production, query:
    // - AlienVault OTX
    // - Emerging Threats
    // - DShield
    // - Google Safe Browsing

    return {
      onList: false,
      listScore: 0,
      lists: []
    };
  }

  /**
   * Check for recent bot activity
   */
  async checkRecentBotActivity(ip) {
    // Check Redis/cache for recent bot detection
    const key = `bot:${ip}`;
    const recentActivity = await this.getCachedData(key);

    return {
      recentBotActivity: recentActivity !== null,
      lastActivity: recentActivity,
      activityCount: 0
    };
  }

  /**
   * Check for port scanning behavior
   */
  async checkPortScanning(ip) {
    // Check for port scan patterns in logs
    return {
      hasScanned: false,
      portsScanned: [],
      scanType: null
    };
  }

  /**
   * Analyze ASN for threat intelligence
   */
  async analyzeASN(ip) {
    // Get ASN information
    const asnInfo = await this.getASNInfo(ip);

    if (!asnInfo) {
      return {
        asn: null,
        org: null,
        isDatacenter: false,
        isVPN: false,
        risk: 0
      };
    }

    const asn = asnInfo.asn || '';
    const org = (asnInfo.org || '').toLowerCase();

    // Check if datacenter
    const isDatacenter = this.isDatacenterASN(asn, org);

    // Check if VPN provider
    const isVPN = this.isVPNProviderASN(asn, org) || this.isVPNProviderOrg(org);

    // Calculate ASN risk
    let risk = 0;
    if (isDatacenter) risk += 30;
    if (isVPN) risk += 40;
    if (this.isSuspiciousASN(asn)) risk += 20;

    return {
      asn: asnInfo.asn,
      org: asnInfo.org,
      country: asnInfo.country,
      isDatacenter,
      isVPN,
      risk: Math.min(risk, 100)
    };
  }

  /**
   * Get ASN information for IP
   */
  async getASNInfo(ip) {
    // Use geoip-lite or similar for ASN lookup
    // In production, use MaxMind GeoIP2 or similar
    try {
      const geo = await this.geoLookup(ip);
      return {
        asn: geo.asn || null,
        org: geo.org || null,
        country: geo.country || null
      };
    } catch {
      return null;
    }
  }

  /**
   * Record internal abuse (called by BotDetectionService when a bot is confirmed).
   * This feeds our own threat intelligence without needing external services.
   */
  recordAbuse(ip, reason = 'bot_detected') {
    if (!ip) return;
    const now = Date.now();
    const existing = internalAbuseDB.get(ip);
    if (existing) {
      existing.count++;
      existing.lastSeen = now;
      existing.reasons = [...new Set([...existing.reasons, reason])];
    } else {
      internalAbuseDB.set(ip, { count: 1, firstSeen: now, lastSeen: now, reasons: [reason] });
    }
  }

  /**
   * GeoIP lookup using geoip-lite (bundled, no external API call).
   */
  async geoLookup(ip) {
    try {
      // Normalise IPv4-mapped IPv6 (::ffff:1.2.3.4)
      const cleanIP = ip.replace(/^::ffff:/, '');
      const geo = geoip.lookup(cleanIP);
      if (!geo) return { country: null, region: null, city: null, org: null, asn: null, timezone: null };
      return {
        country:  geo.country  || null,
        region:   geo.region   || null,
        city:     geo.city     || null,
        org:      geo.org      || null,
        asn:      geo.asn      ? `AS${geo.asn}` : null,
        timezone: geo.timezone || null,
        ll:       geo.ll       || null,
      };
    } catch {
      return { country: null, region: null, city: null, org: null, asn: null, timezone: null };
    }
  }

  /**
   * Check if ASN is a datacenter
   */
  isDatacenterASN(asn, org) {
    const datacenterPatterns = [
      /google/i, /amazon/i, /microsoft/i, /digitalocean/i,
      /linode/i, /vultr/i, /ovh/i, /hetzner/i, /cloudflare/i,
      /akamai/i, /fastly/i, /cloud/i, /hosting/i, /dedicated/i,
      /colocation/i, /server/i, /data.center/i, /aws/i
    ];

    for (const pattern of datacenterPatterns) {
      if (pattern.test(asn) || pattern.test(org)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if ASN belongs to VPN provider
   */
  isVPNProviderASN(asn, org) {
    const vpnPatterns = [
      /nordvpn/i, /expressvpn/i, /surfshark/i, /cyberghost/i,
      /mullvad/i, /protonvpn/i, /windscribe/i, /pia/i,
      /ipvanish/i, /vyprvpn/i, /hotspotshield/i
    ];

    for (const pattern of vpnPatterns) {
      if (pattern.test(asn) || pattern.test(org)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if organization is VPN provider
   */
  isVPNProviderOrg(org) {
    for (const provider of this.threatPatterns.vpnProviders) {
      if (org.includes(provider)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check for suspicious ASN patterns
   */
  isSuspiciousASN(asn) {
    // ASNs with no/random names
    const suspiciousPatterns = [
      /^AS\d{1,3}$/, // Bare ASN number
      /^AS-?$/,      // Empty
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(asn)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Detect VPN, Proxy, or Tor usage
   */
  async detectVPNProxyTor(ip, asnInfo) {
    const signals = [];
    let totalRisk = 0;

    // 1. Check ASN-based detection
    if (asnInfo?.isVPN) {
      signals.push({ type: 'vpn_asn', confidence: 0.9 });
      totalRisk += 45;
    }

    // 2. Check Tor exit node lists
    const torCheck = await this.checkTorExitNodes(ip);
    if (torCheck.isTor) {
      signals.push({ type: 'tor', confidence: torCheck.confidence });
      totalRisk += 80;
    }

    // 3. Check proxy databases
    const proxyCheck = await this.checkProxyDatabases(ip);
    if (proxyCheck.isProxy) {
      signals.push({ type: 'proxy', confidence: proxyCheck.confidence });
      totalRisk += 60;
    }

    // 4. Check for VPN-related DNS/TLS patterns
    const vpnPatternCheck = await this.checkVPNPatterns(ip);
    if (vpnPatternCheck.detected) {
      signals.push({ type: 'vpn_pattern', confidence: vpnPatternCheck.confidence });
      totalRisk += 30;
    }

    // 5. Check for residential proxy (Fingerprint-based)
    const residentialCheck = await this.checkResidentialProxy(ip);
    if (residentialCheck.isResidential) {
      signals.push({ type: 'residential_proxy', confidence: residentialCheck.confidence });
      totalRisk += 50;
    }

    return {
      isVPN: signals.some(s => s.type === 'vpn_asn' || s.type === 'vpn_pattern'),
      isTor: signals.some(s => s.type === 'tor'),
      isProxy: signals.some(s => s.type === 'proxy'),
      isResidentialProxy: signals.some(s => s.type === 'residential_proxy'),
      risk: Math.min(totalRisk, 100),
      signals
    };
  }

  /**
   * Check if IP is a Tor exit node
   */
  async checkTorExitNodes(ip) {
    // In production, check against Tor exit node list
    // or use Onionoo API
    return {
      isTor: false,
      confidence: 0,
      exitNode: null
    };
  }

  /**
   * Check proxy databases
   */
  async checkProxyDatabases(ip) {
    // Check Luminati, Oxylabs, Smartproxy, etc.
    return {
      isProxy: false,
      confidence: 0,
      proxyType: null
    };
  }

  /**
   * Check for VPN-related patterns
   */
  async checkVPNPatterns(ip) {
    // Check for DNS leaks, VPN signatures in TLS
    return {
      detected: false,
      confidence: 0,
      patterns: []
    };
  }

  /**
   * Check for residential proxy
   */
  async checkResidentialProxy(ip) {
    // Residential proxies mimic real ISPs
    // Detection requires fingerprint analysis
    return {
      isResidential: false,
      confidence: 0,
      provider: null
    };
  }

  /**
   * Assess geopolitical risk
   */
  async assessGeoRisk(ip, context = {}) {
    // Get geolocation
    const geo = await this.geoLookup(ip);

    if (!geo || !geo.country) {
      return {
        country: null,
        risk: 0,
        factors: []
      };
    }

    const factors = [];
    let risk = 0;

    // 1. Check high-risk countries
    const highRiskCountries = ['KP', 'IR', 'SY', 'CU', 'VE', 'MM'];
    if (highRiskCountries.includes(geo.country)) {
      factors.push({ type: 'high_risk_country', weight: 20 });
      risk += 20;
    }

    // 2. Check sanctioned countries
    const sanctionedCountries = ['RU', 'BY'];
    if (sanctionedCountries.includes(geo.country)) {
      factors.push({ type: 'sanctioned_country', weight: 25 });
      risk += 25;
    }

    // 3. Check for timezone mismatch
    if (context.timezone && geo.timezone) {
      if (context.timezone !== geo.timezone) {
        factors.push({ type: 'timezone_mismatch', weight: 15 });
        risk += 15;
      }
    }

    // 4. Check language mismatch
    if (context.languages && context.languages.length > 0) {
      // Check if any language matches country
      const countryLanguages = this.getCountryLanguages(geo.country);
      const hasMatch = context.languages.some(lang =>
        countryLanguages.includes(lang.toLowerCase())
      );
      if (!hasMatch) {
        factors.push({ type: 'language_mismatch', weight: 10 });
        risk += 10;
      }
    }

    return {
      country: geo.country,
      city: geo.city,
      region: geo.region,
      timezone: geo.timezone,
      risk: Math.min(risk, 100),
      factors
    };
  }

  /**
   * Get common languages for country
   */
  getCountryLanguages(country) {
    const countryLanguages = {
      'US': ['en', 'es'],
      'CN': ['zh', 'cn'],
      'RU': ['ru'],
      'DE': ['de'],
      'FR': ['fr'],
      'JP': ['ja'],
      'KR': ['ko'],
      'BR': ['pt'],
      'IN': ['hi', 'en'],
      // Add more as needed
    };

    return countryLanguages[country] || ['en'];
  }

  /**
   * Get historical threat data
   */
  async getHistoricalThreats(ip) {
    // Check Redis/database for historical threats
    const key = `threats:${ip}`;
    const threats = await this.getCachedData(key) || [];

    return {
      threatCount: threats.length,
      lastThreat: threats.length > 0 ? threats[threats.length - 1] : null,
      threatTypes: this.aggregateThreatTypes(threats),
      timeRange: '90d'
    };
  }

  /**
   * Aggregate threat types from history
   */
  aggregateThreatTypes(threats) {
    const types = {};
    for (const threat of threats) {
      types[threat.type] = (types[threat.type] || 0) + 1;
    }
    return types;
  }

  /**
   * Determine threat categories based on all signals
   */
  determineThreatCategories(intelligence) {
    const categories = [];
    const { reputation, asnInfo, vpnProxyRisk, historicalThreats } = intelligence;

    // Bot detection
    if (reputation.score > 40 || historicalThreats?.threatCount > 0) {
      categories.push({
        category: this.threatCategories.BOT,
        confidence: this.calculateCategoryConfidence(
          reputation.score > 60 ? 'high' : 'medium'
        )
      });
    }

    // VPN detection
    if (vpnProxyRisk?.isVPN) {
      categories.push({
        category: this.threatCategories.VPN,
        confidence: vpnProxyRisk.risk / 100
      });
    }

    // Proxy detection
    if (vpnProxyRisk?.isProxy) {
      categories.push({
        category: this.threatCategories.PROXY,
        confidence: vpnProxyRisk.risk / 100
      });
    }

    // Tor detection
    if (vpnProxyRisk?.isTor) {
      categories.push({
        category: this.threatCategories.TOR,
        confidence: vpnProxyRisk.risk / 100
      });
    }

    // Datacenter detection
    if (asnInfo?.isDatacenter) {
      categories.push({
        category: this.threatCategories.DATACENTER,
        confidence: 0.7
      });
    }

    // Scanner detection
    if (historicalThreats?.threatTypes?.port_scan) {
      categories.push({
        category: this.threatCategories.SCANNER,
        confidence: historicalThreats.threatTypes.port_scan / 10
      });
    }

    // Credential stuffing
    if (historicalThreats?.threatTypes?.credential_stuffing) {
      categories.push({
        category: this.threatCategories.CREDENTIAL_STUFFER,
        confidence: historicalThreats.threatTypes.credential_stuffing / 10
      });
    }

    return categories;
  }

  /**
   * Calculate confidence for threat category
   */
  calculateCategoryConfidence(level) {
    const confidences = {
      high: 0.9,
      medium: 0.7,
      low: 0.5
    };
    return confidences[level] || 0.5;
  }

  /**
   * Calculate final reputation score
   */
  calculateFinalReputation(intelligence) {
    let score = intelligence.reputation.score;
    const { asnInfo, vpnProxyRisk, geoRisk } = intelligence;

    // Add ASN risk
    if (asnInfo?.risk) {
      score += asnInfo.risk * 0.2;
    }

    // Add VPN/Proxy risk
    if (vpnProxyRisk?.risk) {
      score += vpnProxyRisk.risk * 0.25;
    }

    // Add geo risk
    if (geoRisk?.risk) {
      score += geoRisk.risk * 0.15;
    }

    // Cap at 100
    score = Math.min(score, 100);

    // Determine category
    let category = 'clean';
    if (score > 80) category = 'malicious';
    else if (score > 50) category = 'suspicious';
    else if (score > 20) category = 'questionable';
    else if (score > 0) category = 'unknown';

    return {
      score: Math.round(score),
      factors: intelligence.reputation.factors,
      category
    };
  }

  /**
   * Generate recommendations based on threat intelligence
   */
  generateRecommendations(intelligence) {
    const recommendations = [];
    const { reputation, vpnProxyRisk, geoRisk, threatCategories } = intelligence;

    // High reputation score
    if (reputation.score > 70) {
      recommendations.push({
        action: 'block',
        reason: 'High threat reputation score',
        score: reputation.score
      });
    }
    // Tor usage
    else if (vpnProxyRisk?.isTor) {
      recommendations.push({
        action: 'challenge',
        challengeType: 'advanced',
        reason: 'Tor exit node detected',
        torExit: true
      });
    }
    // VPN/Proxy
    else if (vpnProxyRisk?.isVPN || vpnProxyRisk?.isProxy) {
      recommendations.push({
        action: 'challenge',
        challengeType: 'standard',
        reason: 'VPN or proxy detected',
        vpnDetected: true
      });
    }
    // Datacenter
    else if (threatCategories.some(t => t.category === 'DATACENTER')) {
      recommendations.push({
        action: 'challenge',
        challengeType: 'standard',
        reason: 'Datacenter IP detected'
      });
    }
    // Suspicious geo
    else if (geoRisk?.risk > 30) {
      recommendations.push({
        action: 'monitor',
        reason: 'Geopolitical risk factors detected'
      });
    }
    // Clean
    else {
      recommendations.push({
        action: 'allow',
        reason: 'IP has no significant threat indicators'
      });
    }

    return recommendations;
  }

  /**
   * Categorize reputation score
   */
  categorizeReputation(score) {
    if (score >= 80) return 'malicious';
    if (score >= 50) return 'suspicious';
    if (score >= 20) return 'questionable';
    if (score > 0) return 'unknown';
    return 'clean';
  }

  /**
   * Check if IP is in CIDR range
   */
  ipInRange(ip, range) {
    // Simple implementation - in production use proper IP library
    const [ipNum] = this.ipToNumber(ip);
    const [rangeStart, rangeEnd] = range.split('-');

    if (rangeStart && rangeEnd) {
      const [startNum] = this.ipToNumber(rangeStart.trim());
      const [endNum] = this.ipToNumber(rangeEnd.trim());
      return ipNum >= startNum && ipNum <= endNum;
    }

    return false;
  }

  /**
   * Convert IP to number
   */
  ipToNumber(ip) {
    const parts = ip.split('.').map(Number);
    return [parts[0] * 256 ** 3 + parts[1] * 256 ** 2 + parts[2] * 256 + parts[3], parts];
  }

  /**
   * Get cache key for IP
   */
  getCacheKey(ip) {
    return crypto.createHash('md5').update(ip).digest('hex');
  }

  /**
   * Get cached data from Redis
   */
  async getCachedData(key) {
    if (this.redis) {
      try {
        const data = await this.redis.get(key);
        return data ? JSON.parse(data) : null;
      } catch {
        return null;
      }
    }
    return null;
  }

  /**
   * Store threat report
   */
  async reportThreat(ip, threatData) {
    const key = `threats:${ip}`;
    const threats = await this.getCachedData(key) || [];

    threats.push({
      ...threatData,
      timestamp: Date.now()
    });

    // Keep only last 100 threats
    if (threats.length > 100) {
      threats.shift();
    }

    if (this.redis) {
      await this.redis.setex(key, 86400 * 90, JSON.stringify(threats)); // 90 days
    }
  }

  /**
   * Update threat feed
   */
  async updateThreatFeed() {
    // In production, fetch from multiple threat feeds:
    // - AlienVault OTX
    // - AbuseIPDB
    // - Spamhaus
    // - DShield
    // - Emerging Threats

    this.lastFeedUpdate = Date.now();
    return true;
  }

  /**
   * Get threat statistics
   */
  getThreatStats() {
    return {
      cacheSize: this.intelCache.size,
      lastFeedUpdate: this.lastFeedUpdate || null,
      threatCategories: Object.keys(this.threatCategories)
    };
  }
}
