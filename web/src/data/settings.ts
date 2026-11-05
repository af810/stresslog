import { useSyncExternalStore } from 'react';

// Android版 SettingsRepository (DataStore) の移植。localStorage + 購読可能なミニストア

export interface AppSettings {
  stressThreshold: number;
  samplingIntervalMinutes: number;
  notificationsEnabled: boolean;
  notificationCooldownMinutes: number;
  /** rawAdc がこの値以上で「中」判定（未満は「小」） */
  gripThresholdMedium: number;
  /** rawAdc がこの値以上で「大」判定 */
  gripThresholdLarge: number;
}

// FSR未配線・未校正のため暫定値。実測しながら設定画面から調整する前提
const DEFAULTS: AppSettings = {
  stressThreshold: 70,
  samplingIntervalMinutes: 15,
  notificationsEnabled: true,
  notificationCooldownMinutes: 30,
  gripThresholdMedium: 1500,
  gripThresholdLarge: 3000,
};

const STORAGE_KEY = 'stresslog_settings';

function load(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

let current: AppSettings = load();
const listeners = new Set<() => void>();

function save(next: AppSettings) {
  current = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}

export function getSettings(): AppSettings {
  return current;
}

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setThreshold(value: number) {
  save({ ...current, stressThreshold: value });
}

export function setSamplingInterval(minutes: number) {
  save({ ...current, samplingIntervalMinutes: minutes });
}

export function setNotificationsEnabled(enabled: boolean) {
  save({ ...current, notificationsEnabled: enabled });
}

export function setGripThresholds(medium: number, large: number) {
  save({ ...current, gripThresholdMedium: medium, gripThresholdLarge: large });
}

/** React用フック。設定が変わると再レンダーされる */
export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribeSettings, getSettings);
}
