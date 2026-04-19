/**
 * Dashboard Service - Manages dashboards, linked apps, and aggregated analytics
 *
 * Features:
 * 1. Dashboard creation with unique dashboardId
 * 2. Link/unlink apps to dashboards
 * 3. Aggregate real-time analytics from connected apps
 * 4. Per-app and cross-app statistics
 */

import crypto from 'crypto';
import { nanoid } from 'nanoid';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const ASTRA_DIR = join(homedir(), '.astra');
const APPS_FILE = join(ASTRA_DIR, 'apps.json');

export class DashboardService {
  constructor(options = {}) {
    this.dashboards = new Map();
    this.sessionService = options.sessionService || null;

    // Load existing dashboards from disk if available
    this._loadFromDisk();
  }

  /**
   * Create a new dashboard
   */
  async createDashboard(data = {}) {
    const dashboardId = `dash_${nanoid(16)}`;
    const now = Date.now();

    const dashboard = {
      id: dashboardId,
      name: data.name || 'My Dashboard',
      description: data.description || '',
      created: now,
      lastActive: now,
      apps: [],
      settings: data.settings || {},
      state: {
        totalSessions: 0,
        totalVerifications: 0,
        totalBlockedThreats: 0,
        totalApiCalls: 0,
      },
    };

    this.dashboards.set(dashboardId, dashboard);
    this._saveToDisk();

    return {
      dashboardId,
      name: dashboard.name,
      created: dashboard.created,
      message: 'Dashboard created successfully',
    };
  }

  /**
   * Get dashboard by ID
   */
  async getDashboard(dashboardId) {
    if (!dashboardId) return null;

    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return null;

    dashboard.lastActive = Date.now();
    this.dashboards.set(dashboardId, dashboard);

    return dashboard;
  }

  /**
   * List all dashboards
   */
  async listDashboards() {
    const list = [];
    for (const [, dashboard] of this.dashboards) {
      list.push({
        id: dashboard.id,
        name: dashboard.name,
        description: dashboard.description,
        created: dashboard.created,
        lastActive: dashboard.lastActive,
        appCount: dashboard.apps.length,
      });
    }
    return list;
  }

  /**
   * Delete a dashboard
   */
  async deleteDashboard(dashboardId) {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return false;

    // Unlink all apps from this dashboard
    for (const app of dashboard.apps) {
      await this._unlinkAppFromRegistry(app.appName, dashboardId);
    }

    this.dashboards.delete(dashboardId);
    this._saveToDisk();
    return true;
  }

  /**
   * Link an app to a dashboard
   */
  async linkApp(dashboardId, appData) {
    const dashboard = await this.getDashboard(dashboardId);
    if (!dashboard) {
      return { success: false, reason: 'dashboard_not_found' };
    }

    // Check if already linked
    const existing = dashboard.apps.find(a => a.appName === appData.appName);
    if (existing) {
      return { success: false, reason: 'app_already_linked' };
    }

    const linkedApp = {
      appName: appData.appName,
      apiKeyHash: appData.apiKeyHash || null,
      linkedAt: Date.now(),
      status: 'active',
      path: appData.path || null,
    };

    dashboard.apps.push(linkedApp);
    dashboard.lastActive = Date.now();
    this.dashboards.set(dashboardId, dashboard);

    // Update the apps registry file
    await this._linkAppInRegistry(appData.appName, dashboardId);

    this._saveToDisk();

    return {
      success: true,
      message: `App "${appData.appName}" linked to dashboard`,
    };
  }

  /**
   * Unlink an app from a dashboard
   */
  async unlinkApp(dashboardId, appName) {
    const dashboard = await this.getDashboard(dashboardId);
    if (!dashboard) {
      return { success: false, reason: 'dashboard_not_found' };
    }

    const index = dashboard.apps.findIndex(a => a.appName === appName);
    if (index === -1) {
      return { success: false, reason: 'app_not_found' };
    }

    dashboard.apps.splice(index, 1);
    dashboard.lastActive = Date.now();
    this.dashboards.set(dashboardId, dashboard);

    await this._unlinkAppFromRegistry(appName, dashboardId);

    this._saveToDisk();

    return {
      success: true,
      message: `App "${appName}" unlinked from dashboard`,
    };
  }

  /**
   * Get all apps connected to a dashboard
   */
  async getDashboardApps(dashboardId) {
    const dashboard = await this.getDashboard(dashboardId);
    if (!dashboard) return null;

    return dashboard.apps.map(app => ({
      appName: app.appName,
      linkedAt: app.linkedAt,
      status: app.status,
      path: app.path,
    }));
  }

  /**
   * Get aggregated stats for a dashboard (across all connected apps)
   * This pulls real data from the SessionService analytics
   */
  async getDashboardStats(dashboardId) {
    const dashboard = await this.getDashboard(dashboardId);
    if (!dashboard) return null;

    // Get session service analytics
    const sessionStats = this.sessionService ? this.sessionService.getStats() : null;
    const allAppStats = this.sessionService ? this.sessionService.getAllAppStats() : {};

    // Aggregate across all connected apps
    const apps = dashboard.apps;
    const totalApps = apps.length;
    const activeApps = apps.filter(a => a.status === 'active').length;

    // Build per-app breakdown with REAL data
    const perAppData = apps.map(app => {
      const appStats = allAppStats[app.appName];
      return {
        appName: app.appName,
        status: app.status,
        linkedAt: app.linkedAt,
        // Real per-app stats if available
        hasRealData: !!appStats,
        totalSessions: appStats?.totalSessions || 0,
        activeSessions: appStats?.activeSessions || 0,
        successfulVerifications: appStats?.successfulVerifications || 0,
        failedVerifications: appStats?.failedVerifications || 0,
        blockedRequests: appStats?.blockedRequests || 0,
        challengesIssued: appStats?.challengesIssued || 0,
        challengesPassed: appStats?.challengesPassed || 0,
        lastActivity: appStats?.lastActivity || null,
      };
    });

    const stats = {
      dashboardId,
      dashboardName: dashboard.name,
      totalApps,
      activeApps,
      activeProjects: totalApps,
      verificationsToday: sessionStats ? sessionStats.successfulVerifications : 0,
      blockedThreats: sessionStats ? sessionStats.failedVerifications : 0,
      totalSessions: sessionStats ? sessionStats.totalSessions : 0,
      activeSessions: sessionStats ? sessionStats.activeSessions : 0,
      apiUsage: sessionStats ? Math.min(Math.round((sessionStats.activeSessions / Math.max(sessionStats.totalSessions, 1)) * 100), 100) : 0,
      apps: perAppData,
      lastUpdated: Date.now(),
      hasRealData: sessionStats ? (sessionStats.totalSessions > 0) : false,
    };

    return stats;
  }

  /**
   * Update dashboard settings
   */
  async updateDashboard(dashboardId, updates) {
    const dashboard = this.dashboards.get(dashboardId);
    if (!dashboard) return null;

    if (updates.name) dashboard.name = updates.name;
    if (updates.description !== undefined) dashboard.description = updates.description;
    if (updates.settings) Object.assign(dashboard.settings, updates.settings);

    dashboard.lastActive = Date.now();
    this.dashboards.set(dashboardId, dashboard);
    this._saveToDisk();

    return {
      success: true,
      dashboard: {
        id: dashboard.id,
        name: dashboard.name,
        description: dashboard.description,
        settings: dashboard.settings,
      },
    };
  }

  /**
   * Link app in the ~/.astra/apps.json registry
   */
  async _linkAppInRegistry(appName, dashboardId) {
    try {
      const appsData = this._readAppsFile();
      if (!appsData || !appsData.apps) return;

      // Update all matching apps with this dashboardId
      for (const app of appsData.apps) {
        if (app.name === appName) {
          app.dashboardId = dashboardId;
          app.linkedAt = new Date().toISOString();
        }
      }

      this._writeAppsFile(appsData);
    } catch (e) {
      console.error('Warning: Could not update apps registry:', e.message);
    }
  }

  /**
   * Unlink app from the ~/.astra/apps.json registry
   */
  async _unlinkAppFromRegistry(appName, dashboardId) {
    try {
      const appsData = this._readAppsFile();
      if (!appsData || !appsData.apps) return;

      for (const app of appsData.apps) {
        if (app.name === appName && app.dashboardId === dashboardId) {
          delete app.dashboardId;
          delete app.linkedAt;
        }
      }

      this._writeAppsFile(appsData);
    } catch (e) {
      console.error('Warning: Could not update apps registry:', e.message);
    }
  }

  /**
   * Read apps.json from ~/.astra/
   */
  _readAppsFile() {
    if (!existsSync(APPS_FILE)) return null;
    const raw = readFileSync(APPS_FILE, 'utf-8');
    return JSON.parse(raw);
  }

  /**
   * Write apps.json to ~/.astra/
   */
  _writeAppsFile(data) {
    if (!existsSync(ASTRA_DIR)) {
      mkdirSync(ASTRA_DIR, { recursive: true });
    }
    writeFileSync(APPS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Load dashboards from disk (persisted state)
   */
  _loadFromDisk() {
    const dashboardsFile = join(ASTRA_DIR, 'dashboards.json');
    if (!existsSync(dashboardsFile)) return;

    try {
      const raw = readFileSync(dashboardsFile, 'utf-8');
      const data = JSON.parse(raw);

      if (data.dashboards && Array.isArray(data.dashboards)) {
        for (const dash of data.dashboards) {
          this.dashboards.set(dash.id, dash);
        }
      }
    } catch (e) {
      console.error('Warning: Could not load dashboards from disk:', e.message);
    }
  }

  /**
   * Save dashboards to disk
   */
  _saveToDisk() {
    const dashboardsFile = join(ASTRA_DIR, 'dashboards.json');

    if (!existsSync(ASTRA_DIR)) {
      mkdirSync(ASTRA_DIR, { recursive: true });
    }

    const data = {
      dashboards: Array.from(this.dashboards.values()),
      savedAt: Date.now(),
    };

    writeFileSync(dashboardsFile, JSON.stringify(data, null, 2), 'utf-8');
  }
}

export default DashboardService;
