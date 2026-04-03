import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { Tunnel } from "../types";

function storePath(): string {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  return join(dir, "tunnels.json");
}

export function loadTunnels(): Tunnel[] {
  try {
    const raw = readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Tunnel[];
  } catch {
    // File missing or malformed — start fresh
  }
  return [];
}

export function saveTunnels(tunnels: Tunnel[]): void {
  // Always save tunnels as inactive — active streams are not persisted across restarts
  const toSave = tunnels.map((t) => ({ ...t, active: false }));
  writeFileSync(storePath(), JSON.stringify(toSave, null, 2), "utf8");
}
