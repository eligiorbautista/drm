const prisma = require('../lib/prisma');
const logger = require('../middleware/logger');

/**
 * Settings Service
 * 
 * Manages application and user-specific settings stored in the database.
 * Settings can be organized by category and support different value types.
 */

/**
 * Default application settings
 */
const DEFAULT_SETTINGS = {
  'drm.encryption.enabled': {
    key: 'drm.encryption.enabled',
    value: 'true',
    valueType: 'BOOLEAN',
    category: 'drm',
    description: 'Enable DRM encryption for streams',
    isPublic: true,
  },
  'drm.encryption.mode': {
    key: 'drm.encryption.mode',
    value: 'cbcs',
    valueType: 'STRING',
    category: 'drm',
    description: 'DRM encryption mode (cenc or cbcs)',
    isPublic: true,
  },
  'drm.security.minLevel': {
    key: 'drm.security.minLevel',
    value: '3',
    valueType: 'NUMBER',
    category: 'drm',
    description: 'Minimum DRM security level',
    isPublic: false,
  },
  'drm.outputProtection.digital': {
    key: 'drm.outputProtection.digital',
    value: 'true',
    valueType: 'BOOLEAN',
    category: 'drm',
    description: 'Enable digital output protection',
    isPublic: false,
  },
  'drm.outputProtection.analogue': {
    key: 'drm.outputProtection.analogue',
    value: 'true',
    valueType: 'BOOLEAN',
    category: 'drm',
    description: 'Enable analogue output protection',
    isPublic: false,
  },
  'drm.outputProtection.enforce': {
    key: 'drm.outputProtection.enforce',
    value: 'true',
    valueType: 'BOOLEAN',
    category: 'drm',
    description: 'Enforce output protection',
    isPublic: false,
  },
  'stream.whip.endpoint': {
    key: 'stream.whip.endpoint',
    value: '',
    valueType: 'STRING',
    category: 'stream',
    description: 'Default WHIP endpoint URL',
    isPublic: true,
  },
  'stream.whep.endpoint': {
    key: 'stream.whep.endpoint',
    value: '',
    valueType: 'STRING',
    category: 'stream',
    description: 'Default WHEP endpoint URL',
    isPublic: true,
  },
  'stream.domain': {
    key: 'stream.domain',
    value: '',
    valueType: 'STRING',
    category: 'stream',
    description: 'Cloudflare Stream domain',
    isPublic: true,
  },
  'authentication.maxAttempts': {
    key: 'authentication.maxAttempts',
    value: '5',
    valueType: 'NUMBER',
    category: 'authentication',
    description: 'Maximum login attempts before lockout',
    isPublic: false,
  },
  'authentication.lockoutDuration': {
    key: 'authentication.lockoutDuration',
    value: '900',
    valueType: 'NUMBER',
    category: 'authentication',
    description: 'Account lockout duration in seconds',
    isPublic: false,
  },
  'authentication.sessionExpiry': {
    key: 'authentication.sessionExpiry',
    value: '86400',
    valueType: 'NUMBER',
    category: 'authentication',
    description: 'Session expiry time in seconds',
    isPublic: false,
  },
};

/**
 * Get a setting value by key
 */
async function getSetting(key, userId = null) {
  const setting = await prisma.setting.findFirst({
    where: { key },
  });

  if (!setting) {
    // Fall back to default setting
    const defaultSetting = DEFAULT_SETTINGS[key];
    return defaultSetting ? parseValue(defaultSetting.value, defaultSetting.valueType) : null;
  }

  return parseValue(setting.value, setting.valueType);
}

/**
 * Parse setting value based on type
 */
function parseValue(value, valueType) {
  switch (valueType) {
    case 'NUMBER':
      return parseFloat(value);
    case 'BOOLEAN':
      return value === 'true';
    case 'JSON':
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    default:
      return value;
  }
}

/**
 * Convert value to string based on type
 */
function stringifyValue(value, valueType) {
  switch (valueType) {
    case 'JSON':
      return JSON.stringify(value);
    default:
      return String(value);
  }
}

/**
 * Get multiple settings by category or keys
 */
async function getSettings({ category, keys, userId = null } = {}) {
  const where = {};

  if (category) {
    where.category = category;
  } else if (keys && keys.length > 0) {
    where.key = { in: keys };
  }

  const settings = await prisma.setting.findMany({
    where,
    orderBy: [{ category: 'asc' }, { key: 'asc' }],
  });

  // Parse values
  const result = {};
  for (const setting of settings) {
    result[setting.key] = {
      value: parseValue(setting.value, setting.valueType),
      valueType: setting.valueType,
      category: setting.category,
      description: setting.description,
      isPublic: setting.isPublic,
      updatedAt: setting.updatedAt,
    };
  }

  return result;
}

/**
 * Get all public settings (no auth required)
 */
async function getPublicSettings() {
  const settings = await prisma.setting.findMany({
    where: { isPublic: true },
    orderBy: [{ category: 'asc' }, { key: 'asc' }],
  });

  const result = {};
  for (const setting of settings) {
    result[setting.key] = parseValue(setting.value, setting.valueType);
  }

  return result;
}

/**
 * Set a single setting
 */
async function setSetting(key, value, userId = null, options = {}) {
  const { valueType = 'STRING', category, description, isPublic } = options;

  const stringValue = stringifyValue(value, valueType);

  const setting = await prisma.setting.upsert({
    where: { key },
    update: {
      value: stringValue,
      valueType,
      category,
      description,
      isPublic,
    },
    create: {
      key,
      value: stringValue,
      valueType,
      category,
      description,
      isPublic,
    },
  });

  return { success: true, setting: parseValue(setting.value, setting.valueType) };
}

/**
 * Set multiple settings
 */
async function setSettings(settingsData, userId = null) {
  const results = [];

  for (const [key, data] of Object.entries(settingsData)) {
    const { value, valueType, category, description, isPublic } = data;
    
    const result = await setSetting(key, value, userId, {
      valueType,
      category,
      description,
      isPublic,
    });

    results.push({ key, ...result });
  }

  return { success: true, count: results.length, results };
}

/**
 * Delete a setting
 */
async function deleteSetting(key, userId = null) {
  const setting = await prisma.setting.findFirst({
    where: { key },
  });

  if (!setting) {
    throw new Error('Setting not found');
  }

  await prisma.setting.delete({
    where: { id: setting.id },
  });

  logger.info('Setting deleted', { key });

  return { success: true };
}

/**
 * Reset setting to default
 */
async function resetSetting(key, userId = null) {
  await deleteSetting(key, userId);

  const defaultSetting = DEFAULT_SETTINGS[key];
  if (defaultSetting) {
    return await setSetting(key, defaultSetting.value, userId, defaultSetting);
  }

  return { success: true, message: 'Setting removed (no default exists)' };
}

/**
 * Initialize default settings (run on app startup)
 */
async function initializeDefaultSettings() {
  let initialized = 0;
  let updated = 0;

  for (const [key, defaultData] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = await prisma.setting.findFirst({
      where: { key },
    });

    if (!existing) {
      await prisma.setting.create({
        data: {
          key: defaultData.key,
          value: defaultData.value,
          valueType: defaultData.valueType,
          category: defaultData.category,
          description: defaultData.description,
          isPublic: defaultData.isPublic,
        },
      });
      initialized++;
    } else {
      // Update if description or category changed
      if (
        existing.description !== defaultData.description ||
        existing.category !== defaultData.category
      ) {
        await prisma.setting.update({
          where: { id: existing.id },
          data: {
            description: defaultData.description,
            category: defaultData.category,
          },
        });
        updated++;
      }
    }
  }

  logger.info('Default settings initialized', { initialized, updated });

  return { initialized, updated };
}

/**
 * Get settings by category
 */
async function getSettingsByCategory(category, userId = null) {
  const settings = await prisma.setting.findMany({
    where: { category, userId },
    orderBy: { key: 'asc' },
  });

  const result = {};
  for (const setting of settings) {
    result[setting.key] = {
      value: parseValue(setting.value, setting.valueType),
      valueType: setting.valueType,
      description: setting.description,
      isPublic: setting.isPublic,
      updatedAt: setting.updatedAt,
    };
  }

  // Include default settings for this category if not overridden
  for (const [key, defaultData] of Object.entries(DEFAULT_SETTINGS)) {
    if (defaultData.category === category && !(key in result)) {
      result[key] = {
        value: parseValue(defaultData.value, defaultData.valueType),
        valueType: defaultData.valueType,
        description: defaultData.description,
        isPublic: defaultData.isPublic,
        isDefault: true,
      };
    }
  }

  return result;
}

module.exports = {
  getSetting,
  getSettings,
  getPublicSettings,
  setSetting,
  setSettings,
  deleteSetting,
  resetSetting,
  initializeDefaultSettings,
  getSettingsByCategory,
  DEFAULT_SETTINGS,
  parseValue,
  stringifyValue,
};
