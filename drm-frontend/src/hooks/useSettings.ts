import { useState, useEffect, useCallback } from 'react';
import apiClient, { type Settings } from '../lib/api';

export function useSettings(category?: string, keys?: string[]) {
  const [settings, setSettings] = useState<Settings>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, [category, JSON.stringify(keys)]);

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.getSettings({ category, keys });
      // Extract values from setting objects if they are objects with a value property
      const processedSettings: Settings = {};
      Object.entries(response.settings).forEach(([key, setting]) => {
        if (typeof setting === 'object' && setting !== null && 'value' in (setting as object)) {
          processedSettings[key] = (setting as { value: unknown }).value;
        } else {
          processedSettings[key] = setting;
        }
      });
      setSettings(processedSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch settings');
    } finally {
      setIsLoading(false);
    }
  };

  const updateSetting = async (
    key: string,
    value: unknown,
    options?: {
      valueType?: string;
      category?: string;
      description?: string;
      isPublic?: boolean;
    }
  ) => {
    try {
      const response = await apiClient.updateSetting(key, value, options) as { setting: unknown };
      // Extract the actual value from the setting object if response.setting is an object with a value property
      const newSetting = response.setting;
      const newValue = typeof newSetting === 'object' && newSetting !== null && 'value' in (newSetting as object)
        ? (newSetting as { value: unknown }).value
        : newSetting;

      setSettings((prev) => ({
        ...prev,
        [key]: newValue,
      }));
      return response;
    } catch (err) {
      throw err;
    }
  };

  const updateSettings = async (
    newSettings: Record<string, Partial<Settings[0]> & { value: unknown }>
  ) => {
    try {
      const response = await apiClient.updateSettings(newSettings);
      await fetchSettings(); // Refresh all settings
      return response;
    } catch (err) {
      throw err;
    }
  };

  const resetSetting = async (key: string) => {
    try {
      await apiClient.resetSetting(key);
      await fetchSettings();
    } catch (err) {
      throw err;
    }
  };

  const deleteSetting = async (key: string) => {
    try {
      await apiClient.deleteSetting(key);
      setSettings((prev) => {
        const newSettings = { ...prev };
        delete newSettings[key];
        return newSettings;
      });
    } catch (err) {
      throw err;
    }
  };

  const refetch = useCallback(() => {
    fetchSettings();
  }, [category, JSON.stringify(keys)]);

  return {
    settings,
    isLoading,
    error,
    updateSetting,
    updateSettings,
    resetSetting,
    deleteSetting,
    refetch,
  };
}

export function usePublicSettings() {
  const [settings, setSettings] = useState<Settings>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.getPublicSettings();
      // Extract values from setting objects if they are objects with a value property
      const processedSettings: Settings = {};
      Object.entries(response.settings).forEach(([key, setting]) => {
        if (typeof setting === 'object' && setting !== null && 'value' in (setting as object)) {
          processedSettings[key] = (setting as { value: unknown }).value;
        } else {
          processedSettings[key] = setting;
        }
      });
      setSettings(processedSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch public settings');
    } finally {
      setIsLoading(false);
    }
  };

  return {
    settings,
    isLoading,
    error,
    refetch: fetchSettings,
  };
}

export function useSettingsCategory(category: string) {
  const [settings, setSettings] = useState<Settings>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSettingsByCategory();
  }, [category]);

  const fetchSettingsByCategory = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiClient.getSettingsByCategory(category);
      setSettings(response.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to fetch ${category} settings`);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    settings,
    isLoading,
    error,
    refetch: fetchSettingsByCategory,
  };
}
