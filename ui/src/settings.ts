import {useEffect, useState} from 'react';

// Settings that live purely on the kiosk (localStorage). Anything that
// needs the backend (LED brightness, sound, show mode...) is shown
// disabled in the Settings tab instead - see src/features.ts.
export interface KioskSettings {
  reduceMotion: boolean;
  lightAdmin: boolean; // light theme for the admin screens only
  idleSeconds: number; // 0 disables the attract screen
  doneSeconds: number; // auto-return from the Done screen
}

const KEY = 'james.settings.v1';

export const DEFAULT_SETTINGS: KioskSettings = {
  reduceMotion: false,
  lightAdmin: false,
  idleSeconds: 60,
  doneSeconds: 15,
};

export function loadSettings(): KioskSettings {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? {...DEFAULT_SETTINGS, ...JSON.parse(raw)} : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function applyToDocument(settings: KioskSettings) {
  const root = document.documentElement;
  if (settings.reduceMotion) root.setAttribute('data-reduce-motion', 'true');
  else root.removeAttribute('data-reduce-motion');
}

export function useSettings(): [KioskSettings, (patch: Partial<KioskSettings>) => void] {
  const [settings, setSettings] = useState<KioskSettings>(loadSettings);

  useEffect(() => {
    applyToDocument(settings);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // Fine - defaults next boot.
    }
  }, [settings]);

  return [settings, (patch) => setSettings((prev) => ({...prev, ...patch}))];
}
