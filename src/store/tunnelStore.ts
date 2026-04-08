import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import type { Tunnel, TunnelInput } from "../types";

function storePath(): string {
  const dir = app.getPath("userData");
  mkdirSync(dir, { recursive: true });
  return join(dir, "tunnels.json");
}

/** Migrate a raw persisted object to the current Tunnel shape. */
function migrate(raw: Record<string, unknown>): Tunnel {
  // Inputs: support both the new `inputs[]` format and the old `inputDeviceId` field.
  let inputs: TunnelInput[];
  if (Array.isArray(raw.inputs) && raw.inputs.length > 0) {
    inputs = (raw.inputs as { deviceId?: unknown; appPid?: unknown; gain?: unknown; priority?: unknown }[]).map((inp) => ({
      deviceId: typeof inp.deviceId === "number" ? inp.deviceId : null,
      appPid: typeof inp.appPid === "number" ? inp.appPid : null,
      gain: typeof inp.gain === "number" ? inp.gain : 1,
      priority: typeof inp.priority === "boolean" ? inp.priority : false,
    }));
  } else {
    inputs = [
      {
        deviceId: typeof raw.inputDeviceId === "number" ? raw.inputDeviceId : null,
        appPid: null,
        gain: 1,
        priority: false,
      },
    ];
  }

  return {
    id: String(raw.id ?? crypto.randomUUID()),
    name: String(raw.name ?? "Cable"),
    inputs,
    outputDeviceId: typeof raw.outputDeviceId === "number" ? raw.outputDeviceId : null,
    active: false,
    muted: false,
    channelCount: typeof raw.channelCount === "number" ? raw.channelCount : null,
    gain: typeof raw.gain === "number" ? raw.gain : 1,
    duckingEnabled: typeof raw.duckingEnabled === "boolean" ? raw.duckingEnabled : false,
    duckingAmount: typeof raw.duckingAmount === "number" ? raw.duckingAmount : 0.15,
    duckingRelease: typeof raw.duckingRelease === "number" ? raw.duckingRelease : 1000,
  };
}

export function loadTunnels(): Tunnel[] {
  try {
    const raw = readFileSync(storePath(), "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return (parsed as Record<string, unknown>[]).map(migrate);
    }
  } catch {
    // File missing or malformed — start fresh
  }
  return [];
}

export function saveTunnels(tunnels: Tunnel[]): void {
  // Always save tunnels as inactive/unmuted — stream state is not persisted across restarts
  const toSave = tunnels.map((t) => ({ ...t, active: false, muted: false }));
  writeFileSync(storePath(), JSON.stringify(toSave, null, 2), "utf8");
}
