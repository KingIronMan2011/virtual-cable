import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { AppSettings } from "../types";

export type { AppSettings };

const DEFAULTS: AppSettings = {
  autoUpdate: false,
  minimizeToTray: false,
  experimentalFeatures: false,
  expLatency: false,
  bufferSize: 512,
  expSampleRate: false,
};

function storePath(): string {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  return join(dir, "settings.json");
}

export function loadSettings(): AppSettings {
  try {
    const raw = readFileSync(storePath(), "utf8");
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings: AppSettings): void {
  writeFileSync(storePath(), JSON.stringify(settings, null, 2), "utf8");
}
