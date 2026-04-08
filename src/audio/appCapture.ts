/**
 * TypeScript wrapper around the app-capture native addon.
 *
 * AppCaptureReadable exposes the same .start() / .quit() surface as a
 * naudiodon AudioIO so the router can treat both interchangeably.
 *
 * If the native addon hasn't been built yet (e.g. first checkout before
 * `npm install`) the constructor silently produces a no-op stream so the
 * rest of the app can still start.
 */

import { Readable } from "node:stream";
import path from "node:path";
import { app } from "electron";

/* ── Lazy-load the native addon ──────────────────────────────────────── */
interface NativeAddon {
  listAudioApps(): { pid: number; name: string; exe: string }[];
  AppCaptureStream: new (pid: number) => {
    start(cb: (chunk: Buffer) => void, outputChannels: number): void;
    stop(): void;
  };
}

let _addon: NativeAddon | null = null;
let _addonLoaded = false;

function getAddon(): NativeAddon | null {
  if (_addonLoaded) return _addon;
  _addonLoaded = true;
  try {
    // In packaged builds the native module lives in resources/node_modules.
    // In dev it's in node_modules/ (symlinked from src/native/app-capture).
    _addon = require("app-capture") as NativeAddon;
  } catch {
    // Not yet built or not installed — app capture will be unavailable.
  }
  return _addon;
}

/* ── Public types ─────────────────────────────────────────────────────── */
export interface AudioApp {
  pid: number;
  name: string;
  exe: string;
}

export function listAudioApps(): AudioApp[] {
  return getAddon()?.listAudioApps() ?? [];
}

/* ── AppCaptureReadable ───────────────────────────────────────────────── */
/**
 * A Node.js Readable stream that captures audio from a specific Windows
 * process via WASAPI process loopback.  Output format: 16-bit signed LE
 * PCM at the system mix-format sample rate (typically 48 kHz), up to 2
 * channels (stereo; surround is downmixed by taking the first N channels).
 */
export class AppCaptureReadable extends Readable {
  private readonly pid: number;
  private readonly outputChannels: number;
  private native: ReturnType<NativeAddon["AppCaptureStream"]["prototype"]["constructor"]> | null = null;
  private started = false;

  constructor(pid: number, channels = 2) {
    super();
    this.pid = pid;
    this.outputChannels = Math.min(Math.max(channels, 1), 2);
  }

  /** Start the WASAPI capture thread and pipe chunks into this stream. */
  start(): void {
    if (this.started) return;
    this.started = true;

    const addon = getAddon();
    if (!addon) {
      // Addon not available — stream emits no data (treated as silence by the mixer).
      return;
    }

    try {
      this.native = new addon.AppCaptureStream(this.pid);
      this.native.start((chunk: Buffer) => {
        if (!this.push(chunk)) {
          // Backpressure: the consumer is slow.  For audio we just keep pushing
          // rather than pausing the capture (gaps would cause more distortion
          // than a growing buffer).
        }
      }, this.outputChannels);
    } catch (err) {
      console.error(`[app-capture] failed to start capture for PID ${this.pid}:`, err);
    }
  }

  /** Stop capture and close the stream. */
  quit(): void {
    if (!this.started) return;
    this.started = false;
    try {
      this.native?.stop();
    } catch { /* ignore */ }
    this.native = null;
    this.push(null); // signal end-of-stream
  }

  // Readable._read — flow control is managed by the push() call in the
  // capture callback; this is a no-op.
  _read(): void {}
}
