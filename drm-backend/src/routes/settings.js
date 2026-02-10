const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const logger = require('../middleware/logger');
const {
  getSetting,
  getSettings,
  getPublicSettings,
  setSetting,
  setSettings,
  deleteSetting,
  resetSetting,
  getSettingsByCategory,
} = require('../services/settingsService');

/**
 * GET /api/settings
 *
 * Get all settings (public access)
 */
router.get('/', async (req, res, next) => {
  try {
    const { category, keys } = req.query;

    let settings;
    if (category) {
      settings = await getSettingsByCategory(category, null);
    } else {
      settings = await getSettings({
        category,
        keys: keys ? keys.split(',') : null,
        userId: null,
      });
    }

    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/settings/public
 * 
 * Get all public settings (no authentication required)
 */
router.get('/public', async (req, res, next) => {
  try {
    const settings = await getPublicSettings();
    res.json({ settings });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/settings/encryption/enabled
 * 
 * Get the global encryption enabled setting (publicly accessible)
 */
router.get('/encryption/enabled', async (req, res, next) => {
  try {
    const value = await getSetting('drm.encryption.enabled', null);
    
    // Default to true if setting doesn't exist (preserve existing behavior)
    const encryptionEnabled = value !== null ? value : true;
    
    res.json({ 
      enabled: encryptionEnabled,
      key: 'drm.encryption.enabled'
    });
  } catch (error) {
    // If there's an error, default to enabled (true) to preserve existing behavior
    logger.error('Failed to fetch encryption setting', { error: error.message });
    res.json({ 
      enabled: true,
      key: 'drm.encryption.enabled',
      error: error.message
    });
  }
});

/**
 * PUT /api/settings/encryption/enabled
 *
 * Update the global encryption enabled setting
 */
router.put('/encryption/enabled', async (req, res, next) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'Enabled must be a boolean value' });
    }

    const result = await setSetting('drm.encryption.enabled', enabled, null, {
      valueType: 'BOOLEAN',
      category: 'drm',
      description: 'Enable DRM encryption for streams',
      isPublic: true,
    });

    res.json({
      success: true,
      enabled: result.setting !== undefined ? result.setting : enabled,
      key: 'drm.encryption.enabled'
    });
  } catch (error) {
    logger.error('Failed to update encryption setting', { error: error.message });
    next(error);
  }
});

/**
 * GET /api/settings/:key
 *
 * Get a specific setting
 */
router.get('/:key', async (req, res, next) => {
  try {
    const { key } = req.params;

    const value = await getSetting(key, null);

    if (value === null) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ key, value });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/settings/category/:category
 *
 * Get all settings in a category
 */
router.get('/category/:category', async (req, res, next) => {
  try {
    const { category } = req.params;
    const settings = await getSettingsByCategory(category, null);
    res.json({ category, settings });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/settings/:key
 *
 * Update a specific setting
 */
router.put('/:key', async (req, res, next) => {
  try {
    const { key } = req.params;
    const { value, valueType, category, description, isPublic } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }

    const result = await setSetting(key, value, null, {
      valueType,
      category,
      description,
      isPublic,
    });

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/settings
 *
 * Update multiple settings at once
 */
router.post('/', async (req, res, next) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    const result = await setSettings(settings, null);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/settings/:key
 *
 * Delete a setting
 */
router.delete('/:key', async (req, res, next) => {
  try {
    const { key } = req.params;

    await deleteSetting(key, null);

    res.json({ message: 'Setting deleted successfully' });
  } catch (error) {
    if (error.message === 'Setting not found') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
});

/**
 * POST /api/settings/:key/reset
 *
 * Reset a setting to its default value
 */
router.post('/:key/reset', async (req, res, next) => {
  try {
    const { key } = req.params;

    const result = await resetSetting(key, null);

    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
