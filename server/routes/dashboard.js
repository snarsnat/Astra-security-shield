/**
 * Dashboard API Routes
 *
 * Endpoints:
 *   POST   /api/dashboards/create          - Create a new dashboard
 *   GET    /api/dashboards/list            - List all dashboards
 *   GET    /api/dashboards/:id             - Get dashboard details
 *   GET    /api/dashboards/:id/apps        - Get apps connected to a dashboard
 *   GET    /api/dashboards/:id/stats       - Get aggregated analytics stats
 *   POST   /api/dashboards/:id/apps/link   - Link an app to a dashboard
 *   DELETE /api/dashboards/:id/apps/:name  - Unlink an app from a dashboard
 *   PATCH  /api/dashboards/:id             - Update dashboard settings
 *   DELETE /api/dashboards/:id             - Delete a dashboard
 */

import express from 'express';

export function createDashboardRoutes(dashboardService) {
  const router = express.Router();

  /**
   * GET /api/dashboards
   * List all dashboards (root endpoint)
   */
  router.get('/', async (req, res) => {
    try {
      const dashboards = await dashboardService.listDashboards();
      res.json({ success: true, dashboards });
    } catch (error) {
      console.error('Dashboard list error:', error);
      res.status(500).json({ success: false, error: 'Failed to list dashboards' });
    }
  });

  /**
   * POST /api/dashboards/create
   * Create a new dashboard
   */
  router.post('/create', async (req, res) => {
    try {
      const { name, description, settings } = req.body;

      const result = await dashboardService.createDashboard({
        name: name || 'My Dashboard',
        description: description || '',
        settings: settings || {},
      });

      res.json(result);
    } catch (error) {
      console.error('Dashboard creation error:', error);
      res.status(500).json({
        success: false,
        error: process.env.NODE_ENV === 'development' ? error.message : 'Failed to create dashboard',
      });
    }
  });

  /**
   * GET /api/dashboards/list
   * List all dashboards
   */
  router.get('/list', async (req, res) => {
    try {
      const dashboards = await dashboardService.listDashboards();
      res.json({ success: true, dashboards });
    } catch (error) {
      console.error('Dashboard list error:', error);
      res.status(500).json({ success: false, error: 'Failed to list dashboards' });
    }
  });

  /**
   * GET /api/dashboards/:id
   * Get dashboard details
   */
  router.get('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const dashboard = await dashboardService.getDashboard(id);

      if (!dashboard) {
        return res.status(404).json({
          success: false,
          error: 'Dashboard not found',
        });
      }

      res.json({
        success: true,
        dashboard: {
          id: dashboard.id,
          name: dashboard.name,
          description: dashboard.description,
          created: dashboard.created,
          lastActive: dashboard.lastActive,
          appCount: dashboard.apps.length,
          settings: dashboard.settings,
        },
      });
    } catch (error) {
      console.error('Dashboard get error:', error);
      res.status(500).json({ success: false, error: 'Failed to get dashboard' });
    }
  });

  /**
   * PATCH /api/dashboards/:id
   * Update dashboard settings
   */
  router.patch('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, settings } = req.body;

      const result = await dashboardService.updateDashboard(id, {
        name,
        description,
        settings,
      });

      if (!result) {
        return res.status(404).json({
          success: false,
          error: 'Dashboard not found',
        });
      }

      res.json(result);
    } catch (error) {
      console.error('Dashboard update error:', error);
      res.status(500).json({ success: false, error: 'Failed to update dashboard' });
    }
  });

  /**
   * DELETE /api/dashboards/:id
   * Delete a dashboard
   */
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const deleted = await dashboardService.deleteDashboard(id);

      if (!deleted) {
        return res.status(404).json({
          success: false,
          error: 'Dashboard not found',
        });
      }

      res.json({ success: true, message: 'Dashboard deleted' });
    } catch (error) {
      console.error('Dashboard delete error:', error);
      res.status(500).json({ success: false, error: 'Failed to delete dashboard' });
    }
  });

  /**
   * GET /api/dashboards/:id/apps
   * Get all apps connected to a dashboard
   */
  router.get('/:id/apps', async (req, res) => {
    try {
      const { id } = req.params;
      const apps = await dashboardService.getDashboardApps(id);

      if (!apps) {
        return res.status(404).json({
          success: false,
          error: 'Dashboard not found',
        });
      }

      res.json({ success: true, apps });
    } catch (error) {
      console.error('Dashboard apps get error:', error);
      res.status(500).json({ success: false, error: 'Failed to get dashboard apps' });
    }
  });

  /**
   * POST /api/dashboards/:id/apps/link
   * Link an app to a dashboard
   */
  router.post('/:id/apps/link', async (req, res) => {
    try {
      const { id } = req.params;
      const { appName, apiKeyHash, path } = req.body;

      if (!appName) {
        return res.status(400).json({
          success: false,
          error: 'appName is required',
        });
      }

      const result = await dashboardService.linkApp(id, {
        appName,
        apiKeyHash,
        path,
      });

      if (!result.success) {
        const statusCode = result.reason === 'dashboard_not_found' ? 404 : 400;
        return res.status(statusCode).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('App link error:', error);
      res.status(500).json({ success: false, error: 'Failed to link app' });
    }
  });

  /**
   * DELETE /api/dashboards/:id/apps/:appName
   * Unlink an app from a dashboard
   */
  router.delete('/:id/apps/:appName', async (req, res) => {
    try {
      const { id, appName } = req.params;
      const result = await dashboardService.unlinkApp(id, appName);

      if (!result.success) {
        const statusCode = result.reason === 'dashboard_not_found' ? 404 : 404;
        return res.status(statusCode).json(result);
      }

      res.json(result);
    } catch (error) {
      console.error('App unlink error:', error);
      res.status(500).json({ success: false, error: 'Failed to unlink app' });
    }
  });

  /**
   * GET /api/dashboards/:id/stats
   * Get aggregated analytics stats for a dashboard
   */
  router.get('/:id/stats', async (req, res) => {
    try {
      const { id } = req.params;
      const stats = await dashboardService.getDashboardStats(id);

      if (!stats) {
        return res.status(404).json({
          success: false,
          error: 'Dashboard not found',
        });
      }

      res.json({ success: true, stats });
    } catch (error) {
      console.error('Dashboard stats error:', error);
      res.status(500).json({ success: false, error: 'Failed to get dashboard stats' });
    }
  });

  return router;
}
