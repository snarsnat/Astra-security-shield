/* ASTRA Dashboard — Client-Side Application */

// API base URL — empty means same origin (dashboard server proxies to shield)
// Can be overridden via window.API_BASE_URL before this script loads
const API = window.API_BASE_URL || '';
const VERSION = '2.0.0';
const ITEMS_PER_PAGE = 20;

// HTML escape helper — prevents XSS in innerHTML
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

let state = {
  view: 'apps',
  currentApp: null,
  currentPage: 'overview',
  apps: [],
  analytics: null,
  dashboardId: '',
  // Filtered data
  filteredFeed: [],
  filteredUsers: [],
  filteredFlags: [],
  // Pagination
  feedPage: 1,
  feedFullPage: 1,
  userPage: 1,
  flagPage: 1,
};

// ─── Init ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const idRes = await fetch(`${API}/api/dashboard-id`);
    const idData = await idRes.json();
    state.dashboardId = idData.dashboardId;
    document.getElementById('topbarId').textContent = idData.dashboardId;
    document.getElementById('footerDashboardId').textContent = `ID: ${idData.dashboardId.substring(0, 20)}...`;
    document.getElementById('footerStatus').textContent = 'Status: Connected';

    await loadApps();
    setupNavigation();

    // Start live event stream
    connectSSE();
  } catch (err) {
    console.error('Failed to initialize dashboard:', err);
    document.getElementById('footerStatus').textContent = 'Status: Error';
    document.getElementById('footerStatus').style.color = 'var(--red)';
  }
});

// ─── Navigation ────────────────────────────────────────────
function setupNavigation() {
  // Topbar nav
  document.querySelectorAll('.topbar-nav a').forEach(el => {
    el.addEventListener('click', () => {
      const route = el.dataset.route;
      if (route === 'apps') navigateToApps();
      else if (route === 'about') navigateTo('about');
    });
  });

  // Breadcrumbs
  document.getElementById('breadcrumbs').addEventListener('click', (e) => {
    if (e.target.dataset.route === 'apps') {
      e.preventDefault();
      navigateToApps();
    }
  });

  // Sidebar page nav
  document.querySelectorAll('.sidebar-nav a[data-page]').forEach(el => {
    el.addEventListener('click', () => {
      const page = el.dataset.page;
      navigateToPage(page);
    });
  });
}

function navigateTo(view) {
  state.view = view;
  document.getElementById('view-apps').classList.toggle('hidden', view !== 'apps');
  document.getElementById('view-dashboard').classList.toggle('hidden', view !== 'dashboard');
  document.getElementById('view-about').classList.toggle('hidden', view !== 'about');

  // Update topbar
  document.querySelectorAll('.topbar-nav a').forEach(a => {
    a.classList.toggle('active', a.dataset.route === view);
  });

  // Update breadcrumbs
  updateBreadcrumbs();
}

function navigateToApps() {
  navigateTo('apps');
  state.currentApp = null;
  loadApps();
}

function navigateToApp(appName) {
  state.currentApp = appName;
  state.currentPage = 'overview';
  navigateTo('dashboard');
  loadAppAnalytics(appName);
  updateSidebar();
  showPage('overview');
}

function navigateToPage(page) {
  state.currentPage = page;
  showPage(page);

  document.querySelectorAll('.sidebar-nav a[data-page]').forEach(a => {
    a.classList.toggle('active', a.dataset.page === page);
  });
}

function updateBreadcrumbs() {
  const bc = document.getElementById('breadcrumbs');
  if (state.view === 'apps') {
    bc.innerHTML = '<span class="current">ASTRA</span>';
  } else if (state.view === 'dashboard') {
    bc.innerHTML = `<a data-route="apps" onclick="navigateToApps()">ASTRA</a><span class="sep">/</span><span class="current">${escapeHtml(state.currentApp)}</span>`;
  } else if (state.view === 'about') {
    bc.innerHTML = '<span class="current">ABOUT</span>';
  }
}

function updateSidebar() {
  const container = document.getElementById('sidebarApps');
  container.innerHTML = state.apps.map(a => `
    <a class="${a.name === state.currentApp ? 'active' : ''}" onclick="navigateToApp(${JSON.stringify(a.name)})">
      <span class="dot"></span>
      <span class="name">${escapeHtml(a.name)}</span>
      <span class="badge">${escapeHtml(a.framework || 'web')}</span>
    </a>
  `).join('');
}

function showPage(page) {
  ['overview', 'protection', 'flags', 'traffic', 'oos-scores', 'live-feed', 'challenges', 'sessions'].forEach(p => {
    const el = document.getElementById(`page-${p}`);
    if (el) el.classList.toggle('hidden', p !== page);
  });
}

// ─── Load Apps ─────────────────────────────────────────────
async function loadApps() {
  try {
    const res = await fetch(`${API}/api/apps`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    state.apps = data.apps;

    const container = document.getElementById('appList');

    if (data.apps.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h2>No apps connected</h2>
          <p>Run the following command in your project directory to add ASTRA Shield protection and analytics.</p>
          <code>astra add</code>
        </div>
      `;
      return;
    }

    container.innerHTML = data.apps.map(app => `
      <div class="app-item" onclick="navigateToApp(${JSON.stringify(app.name)})">
        <div class="app-item-info">
          <h3>${escapeHtml(app.name)}</h3>
          <p>${escapeHtml(app.path)}</p>
        </div>
        <div class="app-item-stat">
          <div class="val">${escapeHtml(app.addedAt || '—')}</div>
          <div class="label">Added</div>
        </div>
        <div class="app-item-arrow">→</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load apps:', err);
    const container = document.getElementById('appList');
    container.innerHTML = `
      <div class="empty-state">
        <h2>Failed to Load Apps</h2>
        <p>Could not connect to the dashboard server. Make sure it's running on port 3000.</p>
        <p style="font-family: monospace; font-size: 0.75rem; margin-top: 12px; color: var(--red);">${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

// ─── Load App Analytics ────────────────────────────────────
async function loadAppAnalytics(appName) {
  try {
    updateSidebar();
    const res = await fetch(`${API}/api/analytics/${encodeURIComponent(appName)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.analytics = await res.json();

    // Reset filters and pagination
    state.filteredFeed = [...state.analytics.liveFeed];
    state.filteredUsers = [...state.analytics.recentUsers];
    state.filteredFlags = state.analytics.flaggedActivities ? [...state.analytics.flaggedActivities] : [];
    state.feedPage = 1;
    state.feedFullPage = 1;
    state.userPage = 1;
    state.flagPage = 1;

    // Clear search inputs
    clearFeedSearchInputs();
    clearUserSearchInputs();
    clearFlagSearchInputs();

    renderOverview();
    renderProtection();
    renderFlags();
    renderTraffic();
    renderOosScores();
    renderLiveFeed();
    renderChallenges();
    renderSessions();
    updateFlagBadge();
  } catch (err) {
    console.error('Failed to load analytics:', err);
    showAnalyticsError(err, appName);
  }
}

function clearFeedSearchInputs() {
  ['feedSearchOverview', 'feedFilterTier', 'feedFilterAction',
   'feedSearchFull', 'feedFilterTierFull', 'feedFilterActionFull'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function clearUserSearchInputs() {
  ['userSearch', 'userFilterTier', 'userFilterRisk'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function clearFlagSearchInputs() {
  ['flagSearch', 'flagFilterSeverity'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
}

function updateFlagBadge() {
  const badge = document.getElementById('flagBadge');
  if (!badge || !state.analytics || !state.analytics.flagSummary) return;
  const highCount = state.analytics.flagSummary.high + state.analytics.flagSummary.critical;
  badge.textContent = highCount || '';
  badge.style.display = highCount ? 'inline-block' : 'none';
}

function showAnalyticsError(err, appName) {
  const msg = err.message || 'Unknown error';
  ['statsRow', 'feedListOverview', 'feedListFull', 'oosUserList', 'challengeStats', 'challengeTable',
   'protectionScoreDisplay', 'healthMetrics', 'flagStats', 'flagList', 'threatTable', 'sessionStats', 'behaviorMetrics'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div style="padding: 40px 24px; text-align: center; color: var(--red); font-size: 0.85rem;">Failed to load data for <strong>${escapeHtml(appName)}</strong>: ${escapeHtml(msg)}</div>`;
  });
}

// ─── Render Overview ───────────────────────────────────────
function renderOverview() {
  const a = state.analytics;
  if (!a) return;

  // Stats row
  document.getElementById('statsRow').innerHTML = `
    <div class="stat">
      <div class="stat-label">Total Verifications</div>
      <div class="stat-value">${a.summary.totalVerifications.toLocaleString()}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total Visitors</div>
      <div class="stat-value">${a.summary.totalVisitors.toLocaleString()}</div>
      <div class="stat-change">last 6 months</div>
    </div>
    <div class="stat">
      <div class="stat-label">Blocked</div>
      <div class="stat-value red">${a.summary.totalBlocked.toLocaleString()}</div>
      <div class="stat-change">${(a.summary.totalBlocked / a.summary.totalVisitors * 100).toFixed(1)}% of visitors</div>
    </div>
    <div class="stat">
      <div class="stat-label">Threats Detected</div>
      <div class="stat-value red">${a.summary.totalAttacks}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Avg OOS Score</div>
      <div class="stat-value">${a.summary.avgOosScore.toFixed(2)}</div>
      <div class="stat-change">out of 3.00</div>
    </div>
    <div class="stat">
      <div class="stat-label">Challenge Pass Rate</div>
      <div class="stat-value">${a.summary.challengePassRate}%</div>
    </div>
  `;

  // Protection ribbon
  renderProtectionRibbon();

  // Bot vs Human chart
  drawBotHumanChart('botHumanChart', a.botVsHuman);

  // Pie chart
  drawPieChart('pieChart', a.attacks.filter(at => at.count > 0));

  // Bar chart
  drawBarChart('barChart', a.monthlyVisitors);

  // Risk trend chart
  drawRiskTrendChart('riskTrendChart', a.riskTrend);

  // Live feed (overview shows paginated)
  renderFeedList('feedListOverview', getPaginatedFeed(state.filteredFeed, 'overview'));
}

// ─── Render Protection ─────────────────────────────────────
function renderProtection() {
  const a = state.analytics;
  if (!a || !a.shieldHealth) return;

  const sh = a.shieldHealth;
  const scoreColor = sh.score >= 80 ? 'var(--green, #2d7d46)' : sh.score >= 60 ? '#c8a400' : 'var(--red)';
  document.getElementById('protectionScoreDisplay').innerHTML = `
    <div class="protection-score-circle">
      <svg viewBox="0 0 120 120" class="score-ring">
        <circle cx="60" cy="60" r="52" fill="none" stroke="#e2e0d7" stroke-width="8"/>
        <circle cx="60" cy="60" r="52" fill="none" stroke="${scoreColor}" stroke-width="8"
          stroke-dasharray="${2 * Math.PI * 52}"
          stroke-dashoffset="${2 * Math.PI * 52 * (1 - sh.score / 100)}"
          stroke-linecap="round"
          transform="rotate(-90 60 60)"/>
      </svg>
      <div class="score-value">${sh.score}</div>
      <div class="score-label">PROTECTION</div>
    </div>
  `;

  const metrics = [
    { label: 'Shield Coverage', value: sh.coverage + '%', color: sh.coverage >= 90 ? 'var(--green, #2d7d46)' : '#c8a400' },
    { label: 'Rule Effectiveness', value: sh.ruleEffectiveness + '%', color: sh.ruleEffectiveness >= 80 ? 'var(--green, #2d7d46)' : '#c8a400' },
    { label: 'API Health', value: sh.apiHealth + '%', color: sh.apiHealth >= 95 ? 'var(--green, #2d7d46)' : '#c8a400' },
    { label: 'Challenge Success', value: sh.challengeSuccess + '%', color: sh.challengeSuccess >= 80 ? 'var(--green, #2d7d46)' : '#c8a400' },
    { label: 'False Positive Rate', value: sh.falsePositiveRate + '%', color: sh.falsePositiveRate < 3 ? 'var(--green, #2d7d46)' : 'var(--red)' },
  ];
  document.getElementById('healthMetrics').innerHTML = metrics.map(m => `
    <div class="health-metric">
      <div class="health-metric-label">${m.label}</div>
      <div class="health-metric-value" style="color: ${m.color}">${m.value}</div>
    </div>
  `).join('');

  drawPieChart('deviceChart', a.deviceBreakdown.map(d => ({ type: d.type, count: d.count })));
  drawPieChart('browserChart', a.browserBreakdown.map(b => ({ type: b.name, count: b.count })));

  document.getElementById('geoTable').innerHTML = a.geographicDistribution.slice(0, 10).map(g => `
    <tr>
      <td style="font-weight: 600;">${escapeHtml(g.country)}</td>
      <td style="font-family: monospace;">${Number(g.visitors).toLocaleString()}</td>
      <td style="font-family: monospace; color: ${g.blocked > 10 ? 'var(--red)' : 'inherit'};">${Number(g.blocked).toLocaleString()}</td>
      <td style="font-family: monospace;">${escapeHtml(g.avgOos)}</td>
      <td>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${Math.min(g.percent, 100)}%"></div>
          <span>${g.percent}%</span>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderProtectionRibbon() {
  const a = state.analytics;
  if (!a || !a.shieldHealth) return;
  const sh = a.shieldHealth;
  const scoreColor = sh.score >= 80 ? 'var(--green, #2d7d46)' : sh.score >= 60 ? '#c8a400' : 'var(--red)';
  document.getElementById('protectionRibbon').innerHTML = `
    <div class="ribbon-item">
      <span class="ribbon-label">PROTECTION SCORE</span>
      <span class="ribbon-value" style="color: ${scoreColor}">${sh.score}/100</span>
    </div>
    <div class="ribbon-item">
      <span class="ribbon-label">COVERAGE</span>
      <span class="ribbon-value">${sh.coverage}%</span>
    </div>
    <div class="ribbon-item">
      <span class="ribbon-label">RULES</span>
      <span class="ribbon-value">${sh.ruleEffectiveness}%</span>
    </div>
    <div class="ribbon-item">
      <span class="ribbon-label">API</span>
      <span class="ribbon-value">${sh.apiHealth}%</span>
    </div>
    <div class="ribbon-item">
      <span class="ribbon-label">FLAGS</span>
      <span class="ribbon-value" style="color: ${a.flagSummary.total > 15 ? 'var(--red)' : 'inherit'}">${a.flagSummary.total}</span>
    </div>
  `;
}

// ─── Render Flagged Activity ───────────────────────────────
function renderFlags() {
  const a = state.analytics;
  if (!a || !a.flaggedActivities) return;
  state.filteredFlags = [...a.flaggedActivities];

  const fs = a.flagSummary;
  document.getElementById('flagStats').innerHTML = `
    <div class="stat">
      <div class="stat-label">Total Flags</div>
      <div class="stat-value">${fs.total}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Critical</div>
      <div class="stat-value red">${fs.critical}</div>
    </div>
    <div class="stat">
      <div class="stat-label">High</div>
      <div class="stat-value" style="color: #e87400;">${fs.high}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Medium</div>
      <div class="stat-value" style="color: #c8a400;">${fs.medium}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Auto-Blocked</div>
      <div class="stat-value">${fs.autoBlocked}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Unique IPs</div>
      <div class="stat-value">${fs.uniqueIPs}</div>
    </div>
  `;

  renderFlagList();
  renderFlagPagination();
}

function renderFlagList() {
  const start = (state.flagPage - 1) * ITEMS_PER_PAGE;
  const items = state.filteredFlags.slice(start, start + ITEMS_PER_PAGE);
  const el = document.getElementById('flagList');
  if (items.length === 0) {
    el.innerHTML = '<div style="padding: 40px 24px; text-align: center; color: var(--gray-400); font-size: 0.85rem;">No flags match the current filters.</div>';
    return;
  }
  el.innerHTML = items.map(f => {
    const ago = getTimeAgo(f.timestamp);
    return `
      <div class="flag-item flag-${f.severity}">
        <div class="flag-severity">
          <span class="severity-dot severity-${escapeHtml(f.severity)}"></span>
          <span class="severity-text">${escapeHtml(f.severity).toUpperCase()}</span>
        </div>
        <div class="flag-ip">${escapeHtml(f.ip)}</div>
        <div class="flag-reason">${escapeHtml(f.reason)}</div>
        <div class="flag-detail">
          <span class="flag-count">${f.actionCount} actions</span>
          <span class="flag-deviation ${f.deviation > 500 ? 'high' : ''}">${f.deviation > 0 ? '+' : ''}${f.deviation}% vs baseline</span>
        </div>
        <div class="flag-time">${ago}</div>
        <div class="flag-action-badge">
          ${f.autoBlocked ? '<span class="flag-blocked">BLOCKED</span>' : '<span class="flag-watching">WATCHING</span>'}
        </div>
      </div>
    `;
  }).join('');
}

function renderFlagPagination() {
  const el = document.getElementById('flagPagination');
  if (!el) return;
  const totalItems = state.filteredFlags.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  if (totalPages <= 1) { el.classList.add('hidden'); return; }
  el.classList.remove('hidden');
  let html = `<button ${state.flagPage === 1 ? 'disabled' : ''} onclick="setFlagPage(${state.flagPage - 1})">← Prev</button>`;
  const pages = [];
  if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
  else {
    pages.push(1);
    if (state.flagPage > 3) pages.push('...');
    for (let i = Math.max(2, state.flagPage - 1); i <= Math.min(totalPages - 1, state.flagPage + 1); i++) pages.push(i);
    if (state.flagPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }
  pages.forEach(p => {
    if (p === '...') html += `<span class="page-info">…</span>`;
    else html += `<button class="${p === state.flagPage ? 'active' : ''}" onclick="setFlagPage(${p})">${p}</button>`;
  });
  html += `<span class="page-info">${totalItems} flags</span>`;
  html += `<button ${state.flagPage === totalPages ? 'disabled' : ''} onclick="setFlagPage(${state.flagPage + 1})">Next →</button>`;
  el.innerHTML = html;
}

function setFlagPage(page) {
  state.flagPage = Math.max(1, Math.min(page, Math.ceil(state.filteredFlags.length / ITEMS_PER_PAGE)));
  renderFlagList();
  renderFlagPagination();
}

function filterFlags() {
  const search = document.getElementById('flagSearch').value.toLowerCase();
  const severityFilter = document.getElementById('flagFilterSeverity').value;
  state.filteredFlags = state.analytics.flaggedActivities.filter(f => {
    if (severityFilter && f.severity !== severityFilter) return false;
    if (search) {
      const searchStr = `${f.ip} ${f.reason} ${f.action}`.toLowerCase();
      if (!searchStr.includes(search)) return false;
    }
    return true;
  });
  state.flagPage = 1;
  renderFlagList();
  renderFlagPagination();
}

// ─── Render Traffic ────────────────────────────────────────
function renderTraffic() {
  const a = state.analytics;
  if (!a) return;
  drawHourlyChart('hourlyChart', a.hourlyActivity);
  drawThreatChart('threatChart', a.threatTimeline);
  document.getElementById('threatTable').innerHTML = a.threatTimeline.map(t => `
    <tr>
      <td style="font-family: monospace; font-size: 0.75rem;">${escapeHtml(t.date)}</td>
      <td style="font-family: monospace; font-weight: 700;">${parseInt(t.threats) || 0}</td>
      <td><span class="severity-badge severity-${escapeHtml(t.severity)}">${escapeHtml(t.severity).toUpperCase()}</span></td>
      <td style="font-size: 0.78rem;">${escapeHtml(t.topType)}</td>
    </tr>
  `).join('');
}

// ─── Render Sessions ───────────────────────────────────────
function renderSessions() {
  const a = state.analytics;
  if (!a || !a.sessionAnalytics) return;
  const sa = a.sessionAnalytics;

  const formatDuration = (s) => {
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
  };

  document.getElementById('sessionStats').innerHTML = `
    <div class="stat">
      <div class="stat-label">Total Sessions</div>
      <div class="stat-value">${sa.totalSessions.toLocaleString()}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Avg Duration</div>
      <div class="stat-value">${formatDuration(sa.avgSessionDuration)}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Bot-like Behavior</div>
      <div class="stat-value red">${sa.behavioralPatterns.botLikeBehavior}%</div>
    </div>
    <div class="stat">
      <div class="stat-label">Natural Behavior</div>
      <div class="stat-value">${sa.behavioralPatterns.naturalBehavior}%</div>
    </div>
  `;

  drawPieChart('sessionChart', sa.durationBreakdown.map(d => ({ type: `${d.range} (${d.label})`, count: d.count })));
  drawBehaviorBarChart('behaviorChart', sa.behavioralPatterns);

  document.getElementById('behaviorMetrics').innerHTML = `
    <div class="behavior-metric">
      <div class="behavior-metric-label">Avg Mouse Events/Session</div>
      <div class="behavior-metric-value">${sa.behavioralPatterns.avgMouseEvents}</div>
      <div class="behavior-metric-bar"><div class="behavior-metric-fill" style="width: ${Math.min(sa.behavioralPatterns.avgMouseEvents / 200 * 100, 100)}%"></div></div>
    </div>
    <div class="behavior-metric">
      <div class="behavior-metric-label">Avg Keyboard Events/Session</div>
      <div class="behavior-metric-value">${sa.behavioralPatterns.avgKeyEvents}</div>
      <div class="behavior-metric-bar"><div class="behavior-metric-fill" style="width: ${Math.min(sa.behavioralPatterns.avgKeyEvents / 100 * 100, 100)}%"></div></div>
    </div>
    <div class="behavior-metric">
      <div class="behavior-metric-label">Avg Scroll Events/Session</div>
      <div class="behavior-metric-value">${sa.behavioralPatterns.avgScrollEvents}</div>
      <div class="behavior-metric-bar"><div class="behavior-metric-fill" style="width: ${Math.min(sa.behavioralPatterns.avgScrollEvents / 150 * 100, 100)}%"></div></div>
    </div>
    <div class="behavior-metric">
      <div class="behavior-metric-label">Session Duration Breakdown</div>
      <div class="duration-breakdown">
        ${sa.durationBreakdown.map(d => `
          <div class="duration-item">
            <span class="duration-label">${d.range} ${d.label}</span>
            <div class="duration-bar"><div class="duration-fill" style="width: ${d.percent}%"></div></div>
            <span class="duration-value">${d.percent}%</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ─── Render OOS Scores ─────────────────────────────────────
function renderOosScores() {
  const a = state.analytics;
  if (!a) return;

  // Initialize filtered users
  state.filteredUsers = [...a.recentUsers];

  // User list (paginated)
  renderOosUserList(getPaginatedUsers(state.filteredUsers));
  renderUserPagination('userPagination', state.filteredUsers.length, state.userPage);

  // OOS distribution pie
  drawPieChart('oosPieChart', a.oosDistribution.map(d => ({ type: `${d.label} (${d.range})`, count: d.count })));

  // OOS bar chart by tier
  drawTierBarChart('oosBarChart', a.oosDistribution);
}

// ─── Render Live Feed ──────────────────────────────────────
function renderLiveFeed() {
  const a = state.analytics;
  if (!a) return;
  state.filteredFeed = [...a.liveFeed];
  renderFeedList('feedListFull', getPaginatedFeed(state.filteredFeed, 'full'));
  renderFeedPaginationFull('feedPaginationFull', state.filteredFeed.length, state.feedFullPage, 'full');
}

async function refreshLiveFeed() {
  if (state.currentApp) {
    await loadAppAnalytics(state.currentApp);
  }
}

function getPaginatedFeed(items, view) {
  const page = view === 'overview' ? state.feedPage : state.feedFullPage;
  const start = (page - 1) * ITEMS_PER_PAGE;
  return items.slice(start, start + ITEMS_PER_PAGE);
}

function setFeedPage(page, view) {
  if (view === 'overview') {
    state.feedPage = Math.max(1, Math.min(page, Math.ceil(state.filteredFeed.length / ITEMS_PER_PAGE)));
    renderFeedList('feedListOverview', getPaginatedFeed(state.filteredFeed, 'overview'));
    renderFeedPagination('feedPagination', state.filteredFeed.length, state.feedPage, 'overview');
  } else {
    state.feedFullPage = Math.max(1, Math.min(page, Math.ceil(state.filteredFeed.length / ITEMS_PER_PAGE)));
    renderFeedList('feedListFull', getPaginatedFeed(state.filteredFeed, 'full'));
    renderFeedPaginationFull('feedPaginationFull', state.filteredFeed.length, state.feedFullPage, 'full');
  }
}

function renderFeedPagination(containerId, totalItems, currentPage, view) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  if (totalPages <= 1) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');

  let html = `<button ${currentPage === 1 ? 'disabled' : ''} onclick="setFeedPage(${currentPage - 1}, '${view}')">← Prev</button>`;

  // Show page numbers with ellipsis for large ranges
  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  pages.forEach(p => {
    if (p === '...') {
      html += `<span class="page-info">…</span>`;
    } else {
      html += `<button class="${p === currentPage ? 'active' : ''}" onclick="setFeedPage(${p}, '${view}')">${p}</button>`;
    }
  });

  html += `<span class="page-info">${totalItems} items</span>`;
  html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="setFeedPage(${currentPage + 1}, '${view}')">Next →</button>`;
  el.innerHTML = html;
}

function renderFeedPaginationFull(containerId, totalItems, currentPage, view) {
  renderFeedPagination(containerId, totalItems, currentPage, view);
}

function renderFeedList(containerId, items) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!items || items.length === 0) {
    el.innerHTML = '<div style="padding: 40px 24px; text-align: center; color: var(--gray-400); font-size: 0.85rem;">No activity matches the current filters.</div>';
    return;
  }

  el.innerHTML = items.map(item => {
    const ago = getTimeAgo(item.timestamp);
    const actionStr = String(item.action || '');
    const isBlocked = actionStr.includes('blocked') || actionStr.includes('Bot detected');
    const isChallenge = actionStr.includes('Challenge');
    const cls = isBlocked ? 'blocked' : isChallenge ? 'challenge' : '';
    return `
      <div class="feed-item">
        <div class="feed-time">${ago}</div>
        <div class="feed-action ${cls}">${escapeHtml(item.action)}</div>
        <div class="feed-ip">${escapeHtml(item.ip)}</div>
        <div><span class="tier-badge tier-${parseInt(item.tier) || 0}">${escapeHtml(item.tierName)}</span></div>
        <div class="oos-score ${item.oosScore > 1.5 ? 'high' : ''}">OOS: ${Number(item.oosScore).toFixed(2)}</div>
      </div>
    `;
  }).join('');
}

// ─── Feed Filtering ────────────────────────────────────────
function filterFeed() {
  const search = document.getElementById('feedSearchOverview').value.toLowerCase();
  const tierFilter = document.getElementById('feedFilterTier').value;
  const actionFilter = document.getElementById('feedFilterAction').value;

  state.filteredFeed = state.analytics.liveFeed.filter(item => {
    if (tierFilter && item.tier.toString() !== tierFilter) return false;
    if (actionFilter === 'blocked' && !item.action.includes('blocked') && !item.action.includes('Bot detected')) return false;
    if (actionFilter === 'passed' && !item.action.includes('passed')) return false;
    if (actionFilter === 'challenge' && !item.action.includes('Challenge')) return false;
    if (search) {
      const searchStr = `${item.action} ${item.ip} ${item.tierName}`.toLowerCase();
      if (!searchStr.includes(search)) return false;
    }
    return true;
  });

  state.feedPage = 1;
  renderFeedList('feedListOverview', getPaginatedFeed(state.filteredFeed, 'overview'));
  renderFeedPagination('feedPagination', state.filteredFeed.length, state.feedPage, 'overview');
}

function filterFeedFull() {
  const search = document.getElementById('feedSearchFull').value.toLowerCase();
  const tierFilter = document.getElementById('feedFilterTierFull').value;
  const actionFilter = document.getElementById('feedFilterActionFull').value;

  state.filteredFeed = state.analytics.liveFeed.filter(item => {
    if (tierFilter && item.tier.toString() !== tierFilter) return false;
    if (actionFilter === 'blocked' && !item.action.includes('blocked') && !item.action.includes('Bot detected')) return false;
    if (actionFilter === 'passed' && !item.action.includes('passed')) return false;
    if (actionFilter === 'challenge' && !item.action.includes('Challenge')) return false;
    if (search) {
      const searchStr = `${item.action} ${item.ip} ${item.tierName}`.toLowerCase();
      if (!searchStr.includes(search)) return false;
    }
    return true;
  });

  state.feedFullPage = 1;
  renderFeedList('feedListFull', getPaginatedFeed(state.filteredFeed, 'full'));
  renderFeedPaginationFull('feedPaginationFull', state.filteredFeed.length, state.feedFullPage, 'full');
}

// ─── User Filtering ────────────────────────────────────────
function filterUsers() {
  const search = document.getElementById('userSearch').value.toLowerCase();
  const tierFilter = document.getElementById('userFilterTier').value;
  const riskFilter = document.getElementById('userFilterRisk').value;

  state.filteredUsers = state.analytics.recentUsers.filter(u => {
    if (tierFilter && u.tier.toString() !== tierFilter) return false;
    if (riskFilter === 'low' && u.oosScore > 0.5) return false;
    if (riskFilter === 'medium' && (u.oosScore <= 0.5 || u.oosScore > 1.5)) return false;
    if (riskFilter === 'high' && u.oosScore <= 1.5) return false;
    if (search) {
      const searchStr = `${u.id} ${u.country} ${u.browser} ${u.device}`.toLowerCase();
      if (!searchStr.includes(search)) return false;
    }
    return true;
  });

  state.userPage = 1;
  renderOosUserList(getPaginatedUsers(state.filteredUsers));
  renderUserPagination('userPagination', state.filteredUsers.length, state.userPage);
}

function getPaginatedUsers(items) {
  const start = (state.userPage - 1) * ITEMS_PER_PAGE;
  return items.slice(start, start + ITEMS_PER_PAGE);
}

function setUserPage(page) {
  state.userPage = Math.max(1, Math.min(page, Math.ceil(state.filteredUsers.length / ITEMS_PER_PAGE)));
  renderOosUserList(getPaginatedUsers(state.filteredUsers));
  renderUserPagination('userPagination', state.filteredUsers.length, state.userPage);
}

function renderUserPagination(containerId, totalItems, currentPage) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  if (totalPages <= 1) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');

  let html = `<button ${currentPage === 1 ? 'disabled' : ''} onclick="setUserPage(${currentPage - 1})">← Prev</button>`;

  const pages = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  pages.forEach(p => {
    if (p === '...') {
      html += `<span class="page-info">…</span>`;
    } else {
      html += `<button class="${p === currentPage ? 'active' : ''}" onclick="setUserPage(${p})">${p}</button>`;
    }
  });

  html += `<span class="page-info">${totalItems} users</span>`;
  html += `<button ${currentPage === totalPages ? 'disabled' : ''} onclick="setUserPage(${currentPage + 1})">Next →</button>`;
  el.innerHTML = html;
}

function renderOosUserList(items) {
  const listEl = document.getElementById('oosUserList');
  if (!listEl) return;
  const tierNames = ['Ghost', 'Whisper', 'Nudge', 'Pause', 'Gate'];

  if (items.length === 0) {
    listEl.innerHTML = '<div style="padding: 40px 24px; text-align: center; color: var(--gray-400); font-size: 0.85rem;">No users match the current filters.</div>';
    return;
  }

  const startIdx = (state.userPage - 1) * ITEMS_PER_PAGE;
  listEl.innerHTML = items.map((u, i) => {
    const globalRank = startIdx + i + 1;
    const barWidth = Math.min(u.oosScore / 3 * 60, 60);
    const isHigh = u.oosScore > 1.5;
    return `
      <div class="oos-user">
        <div class="oos-user-rank">#${globalRank}</div>
        <div class="oos-user-id">${escapeHtml(u.id)}</div>
        <div class="oos-user-country">${escapeHtml(u.country)}</div>
        <div>
          <span class="oos-bar" style="width: ${barWidth}px; background: ${isHigh ? 'var(--red)' : 'var(--black)'}"></span>
          <span class="oos-score ${isHigh ? 'high' : ''}">${u.oosScore.toFixed(2)}</span>
        </div>
        <span class="tier-badge tier-${u.tier}">${tierNames[u.tier]}</span>
        <div class="oos-user-sessions">${u.sessions} sessions</div>
      </div>
    `;
  }).join('');
}

// ─── CSV Export ─────────────────────────────────────────────
function exportFeedCSV(view) {
  if (!state.analytics || !state.analytics.liveFeed) return;

  const data = state.filteredFeed.length > 0 ? state.filteredFeed : state.analytics.liveFeed;
  const headers = ['Timestamp', 'Action', 'IP', 'Tier', 'OOS Score', 'Tier Name'];
  const rows = data.map(item => [
    new Date(item.timestamp).toISOString(),
    item.action,
    item.ip,
    item.tier,
    item.oosScore.toFixed(2),
    item.tierName,
  ]);

  downloadCSV([headers, ...rows], `astra-feed-${state.currentApp}-${getDateStamp()}.csv`);
}

function exportVisitorsCSV() {
  if (!state.analytics || !state.analytics.dailyVisitors) return;

  const headers = ['Date', 'Visitors', 'Blocked'];
  const rows = state.analytics.dailyVisitors.map(d => [d.date, d.visitors, d.blocked]);

  downloadCSV([headers, ...rows], `astra-visitors-${state.currentApp}-${getDateStamp()}.csv`);
}

function exportUsersCSV() {
  if (!state.analytics || !state.analytics.recentUsers) return;

  const data = state.filteredUsers.length > 0 ? state.filteredUsers : state.analytics.recentUsers;
  const headers = ['Rank', 'User ID', 'OOS Score', 'Tier', 'Country', 'Browser', 'Device', 'Sessions', 'Last Seen'];
  const rows = data.map((u, i) => [
    i + 1,
    u.id,
    u.oosScore.toFixed(2),
    ['Ghost', 'Whisper', 'Nudge', 'Pause', 'Gate'][u.tier],
    u.country,
    u.browser,
    u.device,
    u.sessions,
    new Date(u.lastSeen).toISOString(),
  ]);

  downloadCSV([headers, ...rows], `astra-users-${state.currentApp}-${getDateStamp()}.csv`);
}

function downloadCSV(rows, filename) {
  const csvContent = rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function getDateStamp() {
  return new Date().toISOString().split('T')[0];
}

function exportFlagsCSV() {
  if (!state.analytics || !state.analytics.flaggedActivities) return;

  const data = state.filteredFlags.length > 0 ? state.filteredFlags : state.analytics.flaggedActivities;
  const headers = ['Flag ID', 'IP', 'Severity', 'Reason', 'Action Count', 'Baseline', 'Deviation %', 'Action', 'OOS Score', 'Auto Blocked', 'Timestamp'];
  const rows = data.map(f => [
    f.id,
    f.ip,
    f.severity,
    f.reason,
    f.actionCount,
    f.baselineCount,
    f.deviation,
    f.action,
    f.oosScore.toFixed(2),
    f.autoBlocked ? 'Yes' : 'No',
    new Date(f.timestamp).toISOString(),
  ]);

  downloadCSV([headers, ...rows], `astra-flags-${state.currentApp}-${getDateStamp()}.csv`);
}

// ─── Render Challenges ─────────────────────────────────────
function renderChallenges() {
  const a = state.analytics;
  if (!a) return;

  // Stats
  document.getElementById('challengeStats').innerHTML = `
    <div class="stat">
      <div class="stat-label">Total Challenges</div>
      <div class="stat-value">${a.summary.challengesCompleted}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Passed</div>
      <div class="stat-value">${a.summary.challengesPassed}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Failed</div>
      <div class="stat-value red">${a.summary.challengesCompleted - a.summary.challengesPassed}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Pass Rate</div>
      <div class="stat-value">${a.summary.challengePassRate}%</div>
    </div>
  `;

  // Table
  document.getElementById('challengeTable').innerHTML = a.challengeTypes.map(c => {
    const failed = c.completed - c.passed;
    const rate = c.completed > 0 ? (c.passed / c.completed * 100).toFixed(1) : '0.0';
    return `
      <tr>
        <td style="font-weight: 600;">${c.type}</td>
        <td style="font-family: monospace;">${c.completed}</td>
        <td style="font-family: monospace;">${c.passed}</td>
        <td style="font-family: monospace; color: var(--red);">${failed}</td>
        <td style="font-family: monospace; font-weight: 700;">${rate}%</td>
      </tr>
    `;
  }).join('');

  // Bar chart
  drawChallengeBarChart('challengeBarChart', a.challengeTypes);
}

// ─── Chart Drawing (Canvas, no libraries) ──────────────────
const PIE_COLORS = ['#0a0a0a', '#6b6960', '#c40000', '#9a978a', '#4a4840', '#c8c5b9', '#e2e0d7', '#f0efe9'];

function drawPieChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data || data.length === 0) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 260 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '260px';
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = 260;
  const cx = width * 0.35;
  const cy = height / 2;
  const radius = Math.max(10, Math.min(cx, cy) - 20);

  ctx.clearRect(0, 0, width, height);

  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return;

  let startAngle = -Math.PI / 2;
  data.forEach((d, i) => {
    const sliceAngle = (d.count / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = PIE_COLORS[i % PIE_COLORS.length];
    ctx.fill();
    ctx.strokeStyle = '#fafaf7';
    ctx.lineWidth = 2;
    ctx.stroke();
    startAngle += sliceAngle;
  });

  // Draw legend on the right
  let ly = 20;
  data.forEach((d, i) => {
    ctx.fillStyle = PIE_COLORS[i % PIE_COLORS.length];
    ctx.fillRect(width * 0.65, ly, 12, 12);
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 1;
    ctx.strokeRect(width * 0.65, ly, 12, 12);

    ctx.fillStyle = '#0a0a0a';
    ctx.font = '600 11px "Space Grotesk", monospace';
    ctx.fillText(d.type || d.label, width * 0.65 + 20, ly + 10);

    ctx.fillStyle = '#6b6960';
    ctx.font = '700 11px monospace';
    ctx.fillText(d.count.toString(), width - 40, ly + 10);

    ly += 22;
  });
}

function drawBarChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data || data.length === 0) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 260 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '260px';
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = 260;
  const padding = { top: 20, right: 20, bottom: 50, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);

  const maxVal = Math.max(...data.map(d => Math.max(d.visitors, d.blocked || 0)));
  const barGroupWidth = chartW / data.length;
  const barWidth = barGroupWidth * 0.35;

  // Grid lines
  ctx.strokeStyle = '#e2e0d7';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();

    ctx.fillStyle = '#9a978a';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    const val = Math.round(maxVal - (maxVal / 4) * i);
    ctx.fillText(val.toLocaleString(), padding.left - 8, y + 4);
  }

  // Bars
  data.forEach((d, i) => {
    const x = padding.left + i * barGroupWidth;

    // Visitors bar
    const h1 = (d.visitors / maxVal) * chartH;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(x + barGroupWidth * 0.15, padding.top + chartH - h1, barWidth, h1);

    // Blocked bar
    if (d.blocked) {
      const h2 = (d.blocked / maxVal) * chartH;
      ctx.fillStyle = '#c40000';
      ctx.fillRect(x + barGroupWidth * 0.15 + barWidth + 2, padding.top + chartH - h2, barWidth, h2);
    }

    // X label
    ctx.fillStyle = '#6b6960';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(x + barGroupWidth / 2, height - padding.bottom + 12);
    ctx.rotate(-0.5);
    ctx.fillText(d.month || d.date, 0, 0);
    ctx.restore();
  });

  // Legend
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(padding.left, height - 12, 10, 10);
  ctx.fillStyle = '#0a0a0a';
  ctx.font = '10px "Space Grotesk"';
  ctx.textAlign = 'left';
  ctx.fillText('Visitors', padding.left + 14, height - 3);

  ctx.fillStyle = '#c40000';
  ctx.fillRect(padding.left + 80, height - 12, 10, 10);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillText('Blocked', padding.left + 94, height - 3);
}

function drawLineChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data || data.length === 0) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 200 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '200px';
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);

  const maxVal = Math.max(...data.map(d => Math.max(d.visitors, d.blocked || 0)));

  // Grid
  ctx.strokeStyle = '#e2e0d7';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padding.top + (chartH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = '#9a978a';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal - (maxVal / 3) * i).toLocaleString(), padding.left - 8, y + 4);
  }

  // Draw filled area
  const stepX = chartW / (data.length - 1);

  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top + chartH);
  data.forEach((d, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + chartH - (d.visitors / maxVal) * chartH;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(padding.left + (data.length - 1) * stepX, padding.top + chartH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(10, 10, 10, 0.06)';
  ctx.fill();

  // Draw line
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + chartH - (d.visitors / maxVal) * chartH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#0a0a0a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Blocked line
  if (data[0].blocked !== undefined) {
    ctx.beginPath();
    data.forEach((d, i) => {
      const x = padding.left + i * stepX;
      const y = padding.top + chartH - ((d.blocked || 0) / maxVal) * chartH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = '#c40000';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // X labels (show every 5th)
  ctx.fillStyle = '#6b6960';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  data.forEach((d, i) => {
    if (i % 5 === 0 || i === data.length - 1) {
      const x = padding.left + i * stepX;
      ctx.fillText(d.date, x, height - padding.bottom + 16);
    }
  });
}

function drawTierBarChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data || data.length === 0) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 260 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '260px';
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = 260;
  const padding = { top: 20, right: 20, bottom: 50, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);

  const maxVal = Math.max(...data.map(d => d.count));
  const barGroupWidth = chartW / data.length;

  // Grid
  ctx.strokeStyle = '#e2e0d7';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padding.top + (chartH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = '#9a978a';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal - (maxVal / 3) * i), padding.left - 8, y + 4);
  }

  const tierColors = ['#0a0a0a', '#6b6960', '#9a978a', '#c8c5b9', '#c40000'];

  data.forEach((d, i) => {
    const x = padding.left + i * barGroupWidth;
    const h = (d.count / maxVal) * chartH;
    ctx.fillStyle = tierColors[i] || '#0a0a0a';
    ctx.fillRect(x + barGroupWidth * 0.2, padding.top + chartH - h, barGroupWidth * 0.6, h);

    // Label
    ctx.fillStyle = '#6b6960';
    ctx.font = '10px "Space Grotesk"';
    ctx.textAlign = 'center';
    ctx.fillText(d.label, x + barGroupWidth / 2, height - padding.bottom + 16);
  });
}

function drawChallengeBarChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data || data.length === 0) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 260 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '260px';
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = 260;
  const padding = { top: 20, right: 20, bottom: 50, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);

  const maxVal = Math.max(...data.map(d => Math.max(d.completed, d.passed)));
  const barGroupWidth = chartW / data.length;

  // Grid
  ctx.strokeStyle = '#e2e0d7';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padding.top + (chartH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = '#9a978a';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal - (maxVal / 3) * i), padding.left - 8, y + 4);
  }

  data.forEach((d, i) => {
    const x = padding.left + i * barGroupWidth;

    // Completed bar
    const h1 = (d.completed / maxVal) * chartH;
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(x + barGroupWidth * 0.1, padding.top + chartH - h1, barGroupWidth * 0.35, h1);

    // Passed bar
    const h2 = (d.passed / maxVal) * chartH;
    ctx.fillStyle = '#6b6960';
    ctx.fillRect(x + barGroupWidth * 0.55, padding.top + chartH - h2, barGroupWidth * 0.35, h2);

    // Label
    ctx.fillStyle = '#6b6960';
    ctx.font = '11px "Space Grotesk"';
    ctx.textAlign = 'center';
    ctx.fillText(d.type, x + barGroupWidth / 2, height - padding.bottom + 16);
  });

  // Legend
  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(padding.left, height - 12, 10, 10);
  ctx.fillStyle = '#0a0a0a';
  ctx.font = '10px "Space Grotesk"';
  ctx.textAlign = 'left';
  ctx.fillText('Completed', padding.left + 14, height - 3);

  ctx.fillStyle = '#6b6960';
  ctx.fillRect(padding.left + 90, height - 12, 10, 10);
  ctx.fillStyle = '#0a0a0a';
  ctx.fillText('Passed', padding.left + 104, height - 3);
}

// ─── Time Helpers ──────────────────────────────────────────
function getTimeAgo(timestamp) {
  const diff = Date.now() - timestamp;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return secs + 's ago';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  return hrs + 'h ago';
}

// ─── Live Event Stream (SSE) ────────────────────────────────
let sseConnection = null;

function connectSSE() {
  if (sseConnection) sseConnection.close();

  sseConnection = new EventSource(`${API}/api/events`);

  sseConnection.onmessage = (e) => {
    try {
      const event = JSON.parse(e.data);

      // Ignore heartbeat-style non-data events
      if (!event.type) return;

      // Update live status indicator
      const dot = document.getElementById('footerStatus');
      if (dot) {
        dot.textContent = 'Status: Live';
        dot.style.color = 'var(--green, #22c55e)';
      }

      if (event.type === 'snapshot') {
        // Full stats snapshot on connect — update summary counters
        updateShieldCounters(event.payload);
        return;
      }

      if (event.type === 'verification' && state.view === 'dashboard' && state.currentApp) {
        const payload = event.payload;

        // Only inject events for the currently-viewed app (or events with no appName)
        if (payload.appName && payload.appName !== state.currentApp) return;

        const newEntry = {
          action:    payload.action,
          ip:        payload.ip || 'unknown',
          tier:      payload.tier ?? 0,
          oosScore:  payload.oosScore ?? 0,
          reason:    payload.reason || null,
          timestamp: payload.timestamp || event.ts || Date.now(),
          tierName:  ['Ghost', 'Whisper', 'Nudge', 'Pause', 'Gate'][payload.tier ?? 0],
        };

        // Prepend to analytics live-feed
        if (state.analytics) {
          state.analytics.liveFeed.unshift(newEntry);
          if (state.analytics.liveFeed.length > 500) state.analytics.liveFeed.pop();

          // Update filtered copies
          state.filteredFeed = [...state.analytics.liveFeed];

          // Update summary counters inline
          if (state.analytics.summary) {
            state.analytics.summary.totalVisitors++;
            if (payload.action === 'blocked') state.analytics.summary.totalBlocked++;
            if (payload.action === 'verified') state.analytics.summary.totalVerifications++;
            if (payload.action === 'challenge_issued') state.analytics.summary.challengesCompleted++;
          }

          // Re-render only the live-feed row; full re-render is expensive
          const liveListOverview = document.getElementById('feedListOverview');
          if (liveListOverview && state.currentPage === 'overview') {
            renderFeedList('feedListOverview', getPaginatedFeed(state.filteredFeed, 'overview'));
          }
          const liveListFull = document.getElementById('feedListFull');
          if (liveListFull && state.currentPage === 'live-feed') {
            renderFeedList('feedListFull', getPaginatedFeed(state.filteredFeed, 'full'));
          }

          // Update summary stats on overview page
          updateLiveCounters();
          updateFlagBadge();
        }
      }

      if (event.type === 'rate_limited' || event.type === 'blocked_request') {
        // Flash warning in footer
        const dot = document.getElementById('footerStatus');
        if (dot) { dot.textContent = 'Status: Threat Detected'; dot.style.color = 'var(--red, #ef4444)'; }
        setTimeout(() => {
          if (dot) { dot.textContent = 'Status: Live'; dot.style.color = 'var(--green, #22c55e)'; }
        }, 3000);
      }
    } catch { /* malformed event */ }
  };

  sseConnection.onerror = () => {
    const dot = document.getElementById('footerStatus');
    if (dot) { dot.textContent = 'Status: Reconnecting…'; dot.style.color = 'var(--orange, #f97316)'; }
    // Browser will auto-reconnect EventSource after network error
  };

  sseConnection.onopen = () => {
    const dot = document.getElementById('footerStatus');
    if (dot) { dot.textContent = 'Status: Live'; dot.style.color = 'var(--green, #22c55e)'; }
  };
}

function updateShieldCounters(stats) {
  // Update sidebar/footer counts if elements exist
  const el = (id) => document.getElementById(id);
  if (el('statTotalSessions') && stats.totalSessions !== undefined)
    el('statTotalSessions').textContent = stats.totalSessions.toLocaleString();
  if (el('statActiveSessions') && stats.activeSessions !== undefined)
    el('statActiveSessions').textContent = stats.activeSessions.toLocaleString();
}

function updateLiveCounters() {
  if (!state.analytics?.summary) return;
  const s = state.analytics.summary;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('summaryTotalVisitors',       (s.totalVisitors || 0).toLocaleString());
  set('summaryTotalVerifications',  (s.totalVerifications || 0).toLocaleString());
  set('summaryTotalBlocked',        (s.totalBlocked || 0).toLocaleString());
  set('summaryChallengesCompleted', (s.challengesCompleted || 0).toLocaleString());
}

// ─── Periodic full analytics refresh every 60s ──────────────
setInterval(() => {
  if (state.view === 'dashboard' && state.currentApp) {
    fetch(`${API}/api/analytics/${encodeURIComponent(state.currentApp)}`)
      .then(r => r.json())
      .then(data => {
        // Merge: keep in-memory live-feed (more up-to-date than disk), update everything else
        const localFeed = state.analytics?.liveFeed || [];
        state.analytics = data;
        // Merge any locally-held events that are newer than the returned feed
        const latestInFetch = data.liveFeed?.[0]?.timestamp || 0;
        const newLocal = localFeed.filter(e => e.timestamp > latestInFetch);
        state.analytics.liveFeed = [...newLocal, ...(data.liveFeed || [])].slice(0, 500);
        state.filteredFeed = [...state.analytics.liveFeed];
        state.filteredUsers = [...(state.analytics.recentUsers || [])];
        state.filteredFlags = [...(state.analytics.flaggedActivities || [])];
        filterFeed(); filterFeedFull(); filterUsers(); filterFlags();
        if (state.currentPage === 'overview') renderFeedList('feedListOverview', getPaginatedFeed(state.filteredFeed, 'overview'));
        updateFlagBadge();
        updateLiveCounters();
      })
      .catch(err => console.warn('Analytics refresh error:', err));
  }
}, 60_000);

// ─── New Chart Types ───────────────────────────────────────
function drawBotHumanChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 260 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '260px';
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = 260;
  const cx = width * 0.4;
  const cy = height / 2;
  const radius = Math.max(10, Math.min(cx, cy) - 30);

  ctx.clearRect(0, 0, width, height);

  const segments = [
    { label: 'Verified Human', value: data.verifiedHuman, color: '#2d7d46' },
    { label: 'Suspected Bot', value: data.suspectedBot, color: '#c8a400' },
    { label: 'Confirmed Bot', value: data.confirmedBot, color: '#c40000' },
    { label: 'Unclassified', value: data.unclassified, color: '#e2e0d7' },
  ];

  const total = segments.reduce((s, seg) => s + seg.value, 0);
  let startAngle = -Math.PI / 2;
  segments.forEach(seg => {
    const sliceAngle = (seg.value / total) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = seg.color;
    ctx.fill();
    ctx.strokeStyle = '#fafaf7';
    ctx.lineWidth = 2;
    ctx.stroke();
    startAngle += sliceAngle;
  });

  // Center circle (donut)
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2);
  ctx.fillStyle = '#fafaf7';
  ctx.fill();

  // Center text
  ctx.fillStyle = '#0a0a0a';
  ctx.font = '700 20px "Space Grotesk"';
  ctx.textAlign = 'center';
  ctx.fillText(`${data.verifiedHuman}%`, cx, cy + 3);
  ctx.font = '500 9px "Space Grotesk"';
  ctx.fillStyle = '#6b6960';
  ctx.fillText('HUMAN', cx, cy + 16);

  // Legend
  let ly = 25;
  segments.forEach(seg => {
    ctx.fillStyle = seg.color;
    ctx.fillRect(width * 0.7, ly, 12, 12);
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 1;
    ctx.strokeRect(width * 0.7, ly, 12, 12);
    ctx.fillStyle = '#0a0a0a';
    ctx.font = '600 11px "Space Grotesk"';
    ctx.textAlign = 'left';
    ctx.fillText(seg.label, width * 0.7 + 18, ly + 10);
    ctx.fillStyle = '#6b6960';
    ctx.font = '700 11px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${seg.value}%`, width - 10, ly + 10);
    ly += 24;
  });
}

function drawRiskTrendChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data || data.length === 0) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 200 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '200px';
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 40, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);

  const maxVal = Math.max(...data.map(d => Math.max(d.avgRisk, d.maxRisk)), 1);

  // Grid
  ctx.strokeStyle = '#e2e0d7';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padding.top + (chartH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = '#9a978a';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText((maxVal - (maxVal / 3) * i).toFixed(1), padding.left - 8, y + 4);
  }

  const stepX = chartW / (data.length - 1);

  // Max risk area
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top + chartH);
  data.forEach((d, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + chartH - (d.maxRisk / maxVal) * chartH;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(padding.left + (data.length - 1) * stepX, padding.top + chartH);
  ctx.closePath();
  ctx.fillStyle = 'rgba(196, 0, 0, 0.05)';
  ctx.fill();

  // Max risk line
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + chartH - (d.maxRisk / maxVal) * chartH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#c40000';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Avg risk line
  ctx.beginPath();
  data.forEach((d, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + chartH - (d.avgRisk / maxVal) * chartH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#0a0a0a';
  ctx.lineWidth = 2;
  ctx.stroke();

  // X labels
  ctx.fillStyle = '#6b6960';
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  data.forEach((d, i) => {
    if (i % 5 === 0 || i === data.length - 1) {
      const x = padding.left + i * stepX;
      ctx.fillText(d.date, x, height - padding.bottom + 16);
    }
  });

  // Legend
  ctx.strokeStyle = '#0a0a0a';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(padding.left, height - 10); ctx.lineTo(padding.left + 20, height - 10); ctx.stroke();
  ctx.fillStyle = '#0a0a0a';
  ctx.font = '10px "Space Grotesk"';
  ctx.textAlign = 'left';
  ctx.fillText('Avg Risk', padding.left + 24, height - 6);

  ctx.strokeStyle = '#c40000';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(padding.left + 100, height - 10); ctx.lineTo(padding.left + 120, height - 10); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillText('Max Risk', padding.left + 124, height - 6);
}

function drawHourlyChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data || data.length === 0) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 220 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '220px';
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = 220;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);

  const maxVal = Math.max(...data.map(d => d.visitors));
  const barW = chartW / data.length;

  // Grid
  ctx.strokeStyle = '#e2e0d7';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padding.top + (chartH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    ctx.fillStyle = '#9a978a';
    ctx.font = '10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal - (maxVal / 3) * i), padding.left - 8, y + 4);
  }

  data.forEach((d, i) => {
    const x = padding.left + i * barW;
    const h = (d.visitors / maxVal) * chartH;

    // Color based on attacks
    const attackIntensity = d.attacks / 5;
    const r = Math.round(10 + attackIntensity * 186);
    const g = Math.round(10 - attackIntensity * 10);
    const b = Math.round(10);

    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fillRect(x + 1, padding.top + chartH - h, barW - 2, h);

    // X label
    if (i % 3 === 0) {
      ctx.fillStyle = '#6b6960';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(d.label, x + barW / 2, height - padding.bottom + 12);
    }
  });
}

function drawThreatChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data || data.length === 0) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 200 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '200px';
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = 200;
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);

  const maxVal = Math.max(...data.map(d => d.threats), 1);
  const barW = chartW / data.length;

  const severityColors = { low: '#6b6960', medium: '#c8a400', high: '#e87400', critical: '#c40000' };

  data.forEach((d, i) => {
    const x = padding.left + i * barW;
    const h = (d.threats / maxVal) * chartH;
    ctx.fillStyle = severityColors[d.severity] || '#0a0a0a';
    ctx.fillRect(x + 1, padding.top + chartH - h, barW - 2, h);

    if (i % 2 === 0) {
      ctx.fillStyle = '#6b6960';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(d.date, x + barW / 2, height - padding.bottom + 12);
    }
  });

  // Legend
  let lx = padding.left;
  Object.entries(severityColors).forEach(([sev, col]) => {
    ctx.fillStyle = col;
    ctx.fillRect(lx, height - 12, 10, 10);
    ctx.fillStyle = '#0a0a0a';
    ctx.font = '9px "Space Grotesk"';
    ctx.textAlign = 'left';
    ctx.fillText(sev.toUpperCase(), lx + 14, height - 3);
    lx += 80;
  });
}

function drawBehaviorBarChart(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !data) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = 260 * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = '260px';
  ctx.scale(dpr, dpr);

  const width = rect.width;
  const height = 260;
  const padding = { top: 20, right: 20, bottom: 20, left: 50 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  ctx.clearRect(0, 0, width, height);

  const items = [
    { label: 'Mouse', value: data.avgMouseEvents, max: 200 },
    { label: 'Keyboard', value: data.avgKeyEvents, max: 100 },
    { label: 'Scroll', value: data.avgScrollEvents, max: 150 },
  ];

  const barH = chartH / items.length * 0.6;
  const gap = chartH / items.length;

  items.forEach((item, i) => {
    const y = padding.top + i * gap + (gap - barH) / 2;
    const w = (item.value / item.max) * chartW;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(padding.left, y, w, barH);

    ctx.fillStyle = '#6b6960';
    ctx.font = '11px "Space Grotesk"';
    ctx.textAlign = 'right';
    ctx.fillText(item.label, padding.left - 8, y + barH / 2 + 4);

    ctx.fillStyle = '#0a0a0a';
    ctx.font = '700 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(item.value.toString(), padding.left + w + 8, y + barH / 2 + 4);
  });
}
