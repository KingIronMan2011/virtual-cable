/**
 * engine.ts
 *
 * Thin TypeScript adapter around the native virtual-cable-engine addon.
 * Exposes the exact same API surface as the old router.ts + devices.ts +
 * appCapture.ts modules so main.ts IPC handlers require minimal changes.
 */

import { EventEmitter } from "node:events";
import type { AudioDevice } from "../types";

/* ── Load the native addon ─────────────────────────────────────────────── */

interface NativeEngine {
  getAudioDevices(): AudioDevice[];
  listAudioApps(): { pid: number; name: string; exe: string }[];
  createTunnel(
    tunnelId: string,
    inputs: {
      deviceId: number;
      appPid?: number;
      gain: number;
      priority: boolean;
    }[],
    outputDeviceId: number,
    framesPerBuffer: number,
    channelCount: number,
    ducking: { enabled: boolean; amount: number; release: number },
  ): void;
  destroyTunnel(tunnelId: string): void;
  destroyAllTunnels(): void;
  reloadAllTunnels(framesPerBuffer: number): void;
  setTunnelMuted(tunnelId: string, muted: boolean): void;
  setTunnelGain(tunnelId: string, gain: number): void;
  setTunnelInputGain(
    tunnelId: string,
    inputIndex: number,
    gain: number,
  ): void;
  setTunnelInputPriority(
    tunnelId: string,
    inputIndex: number,
    priority: boolean,
  ): void;
  setTunnelDucking(
    tunnelId: string,
    ducking: { enabled: boolean; amount: number; release: number },
  ): void;
  getTunnelSampleRate(tunnelId: string): number | null;
  getTunnelChannelCount(tunnelId: string): number | null;
  registerLevelCallback(
    cb: (tunnelId: string, level: number) => void,
  ): void;
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const engine: NativeEngine = require("virtual-cable-engine");

/* ── Level emitter (same interface as the old router.ts) ───────────────── */

/** Emits `("level", tunnelId: string, level: number)` at ~20 fps per active tunnel. */
export const levelEmitter = new EventEmitter();

/* Register the native level callback once — it fires from the TSFN on the
   Node.js main thread, so EventEmitter.emit is safe here. */
engine.registerLevelCallback((tunnelId: string, level: number) => {
  levelEmitter.emit("level", tunnelId, level);
});

/* ── Re-exports matching the old module API ────────────────────────────── */

export interface InputConfig {
  deviceId: number;
  /** Process ID for app loopback capture; undefined = device input. */
  appPid?: number;
  gain: number;
  priority: boolean;
}

export interface DuckingConfig {
  enabled: boolean;
  /** Target linear gain for ducked non-priority inputs (0–1). */
  amount: number;
  /** Release time in milliseconds. */
  release: number;
}

export function getAudioDevices(): AudioDevice[] {
  return engine.getAudioDevices();
}

export function listAudioApps(): {
  pid: number;
  name: string;
  exe: string;
}[] {
  return engine.listAudioApps();
}

export function createTunnel(
  tunnelId: string,
  inputs: InputConfig[],
  outputDeviceId: number,
  framesPerBuffer = 0,
  requestedChannels: number | null = null,
  ducking: DuckingConfig = { enabled: false, amount: 0.15, release: 1000 },
): void {
  engine.createTunnel(
    tunnelId,
    inputs,
    outputDeviceId,
    framesPerBuffer,
    requestedChannels ?? 0,
    ducking,
  );
}

export function destroyTunnel(tunnelId: string): void {
  engine.destroyTunnel(tunnelId);
}

export function destroyAllTunnels(): void {
  engine.destroyAllTunnels();
}

export function reloadAllTunnels(framesPerBuffer: number): void {
  engine.reloadAllTunnels(framesPerBuffer);
}

export function setTunnelMuted(tunnelId: string, muted: boolean): void {
  engine.setTunnelMuted(tunnelId, muted);
}

export function setTunnelGain(tunnelId: string, gain: number): void {
  engine.setTunnelGain(tunnelId, gain);
}

export function setTunnelInputGain(
  tunnelId: string,
  inputIndex: number,
  gain: number,
): void {
  engine.setTunnelInputGain(tunnelId, inputIndex, gain);
}

export function setTunnelInputPriority(
  tunnelId: string,
  inputIndex: number,
  priority: boolean,
): void {
  engine.setTunnelInputPriority(tunnelId, inputIndex, priority);
}

export function setTunnelDucking(
  tunnelId: string,
  ducking: DuckingConfig,
): void {
  engine.setTunnelDucking(tunnelId, ducking);
}

export function getTunnelSampleRate(tunnelId: string): number | null {
  return engine.getTunnelSampleRate(tunnelId);
}

export function getTunnelChannelCount(tunnelId: string): number | null {
  return engine.getTunnelChannelCount(tunnelId);
}
