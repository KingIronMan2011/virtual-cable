import { EventEmitter } from "node:events";
import { Transform } from "node:stream";
import { AudioIO, SampleFormat16Bit, getDevices } from "naudiodon";
import type { DeviceInfo } from "naudiodon";
import type { AudioIOOptions } from "../types";

interface StreamPair {
  input: InstanceType<typeof AudioIO>;
  output: InstanceType<typeof AudioIO>;
  inputDeviceId: number;
  outputDeviceId: number;
  sampleRate: number;
  setMuted: (muted: boolean) => void;
}

const activeTunnels = new Map<string, StreamPair>();

/** Emits `("level", tunnelId: string, level: number)` at ~20 fps per active tunnel. */
export const levelEmitter = new EventEmitter();

function tryQuit(stream: InstanceType<typeof AudioIO> | null): void {
  if (!stream) return;
  try {
    stream.quit();
  } catch {
    /* already closed */
  }
}

/**
 * Calculates RMS of a 16-bit LE PCM buffer, returned in dBFS normalized to
 * the 0-1 range (0 = -60 dBFS or below, 1 = 0 dBFS).
 */
function rmsLevel(chunk: Buffer): number {
  const samples = chunk.length >> 1;
  if (samples === 0) return 0;
  let sumSq = 0;
  for (let i = 0; i + 1 < chunk.length; i += 2) {
    const s = chunk.readInt16LE(i) / 32768;
    sumSq += s * s;
  }
  const rms = Math.sqrt(sumSq / samples);
  const db = 20 * Math.log10(Math.max(rms, 1e-9));
  return Math.max(0, Math.min(1, (db + 60) / 60));
}

/** Pass-through Transform that samples RMS level and emits it at most every 50 ms.
 *  When muted, replaces audio data with silence and emits level 0. */
function createMonitor(
  tunnelId: string,
  onLevel: (level: number) => void,
): { transform: Transform; setMuted: (muted: boolean) => void } {
  let lastEmit = 0;
  let muted = false;
  const transform = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      const now = Date.now();
      if (muted) {
        if (now - lastEmit >= 50) {
          lastEmit = now;
          onLevel(0);
        }
        cb(null, Buffer.alloc(chunk.length, 0));
        return;
      }
      if (now - lastEmit >= 50) {
        lastEmit = now;
        onLevel(rmsLevel(chunk));
      }
      cb(null, chunk);
    },
  });
  return {
    transform,
    setMuted: (m: boolean) => {
      muted = m;
    },
  };
}

/**
 * For routing we prefer MME over WASAPI.
 * MME routes through the Windows audio mixer which handles sample rate
 * conversion automatically — WASAPI shared mode can reject rates that
 * don't match the Windows-configured device format.
 *
 * MME device names are truncated to 31 chars; we match by checking whether
 * one name starts with the other to handle the truncation difference.
 */
function resolveRoutingId(deviceId: number, all: DeviceInfo[]): number {
  const dev = all.find((d) => d.id === deviceId);
  if (!dev || dev.hostAPIName !== "Windows WASAPI") return deviceId;

  const mme = all.find(
    (d) =>
      d.hostAPIName === "MME" &&
      d.maxInputChannels === dev.maxInputChannels &&
      d.maxOutputChannels === dev.maxOutputChannels &&
      (dev.name.startsWith(d.name.trimEnd()) ||
        d.name.trimEnd().startsWith(dev.name)),
  );

  return mme?.id ?? deviceId;
}

export function createTunnel(
  tunnelId: string,
  inputDeviceId: number,
  outputDeviceId: number,
  framesPerBuffer = 0,
): void {
  if (activeTunnels.has(tunnelId)) destroyTunnel(tunnelId);

  const all = getDevices();

  const routingInputId = resolveRoutingId(inputDeviceId, all);
  const routingOutputId = resolveRoutingId(outputDeviceId, all);

  const inputInfo = all.find((d) => d.id === routingInputId);
  const outputInfo = all.find((d) => d.id === routingOutputId);

  const channels = Math.min(
    inputInfo?.maxInputChannels ?? 1,
    outputInfo?.maxOutputChannels ?? 2,
    2,
  );

  // MME goes through Windows audio mixer — 48000 is universally accepted.
  // If routing fell back to WASAPI (no MME equivalent found), use the
  // output device's reported default rate which is the safest single choice.
  const sampleRate =
    inputInfo?.hostAPIName === "MME" || outputInfo?.hostAPIName === "MME"
      ? 48000
      : (outputInfo?.defaultSampleRate ??
        inputInfo?.defaultSampleRate ??
        48000);

  // TS6 infers a narrow type for `new AudioIO(...)` (it's typed as a function, not
  // a class) so framesPerBuffer triggers excess-property checks. Cast to any to
  // pass it through — the naudiodon AudioOptions interface does include the field.
  // framesPerBuffer=0 means "let PortAudio choose" (original stable behaviour).
  const fpb = framesPerBuffer > 0 ? { framesPerBuffer } : {};

  const input = new AudioIO({
    inOptions: {
      channelCount: channels,
      sampleFormat: SampleFormat16Bit,
      sampleRate,
      ...fpb,
      deviceId: routingInputId,
      closeOnError: true,
    } as AudioIOOptions,
  });

  const output = new AudioIO({
    outOptions: {
      channelCount: channels,
      sampleFormat: SampleFormat16Bit,
      sampleRate,
      ...fpb,
      deviceId: routingOutputId,
      closeOnError: false,
    } as AudioIOOptions,
  });

  const { transform: monitor, setMuted } = createMonitor(tunnelId, (level) => {
    levelEmitter.emit("level", tunnelId, level);
  });

  // Attach error handlers before starting — an unhandled 'error' event on a
  // Node stream crashes the process. Cast to EventEmitter because naudiodon's
  // typings omit the EventEmitter methods despite AudioIO extending stream.
  (input as unknown as NodeJS.EventEmitter).on("error", (err: Error) => {
    console.error(`[tunnel:${tunnelId}] input error:`, err.message);
    destroyTunnel(tunnelId);
  });
  (output as unknown as NodeJS.EventEmitter).on("error", (err: Error) => {
    console.error(`[tunnel:${tunnelId}] output error:`, err.message);
    destroyTunnel(tunnelId);
  });

  // naudiodon's typings don't satisfy Node's stream interfaces, so we cast
  // both ends to insert the Transform monitor in between.
  (input as unknown as NodeJS.ReadableStream)
    .pipe(monitor)
    .pipe(output as unknown as NodeJS.WritableStream);
  output.start();
  input.start();

  activeTunnels.set(tunnelId, {
    input,
    output,
    inputDeviceId,
    outputDeviceId,
    sampleRate,
    setMuted,
  });
}

export function destroyTunnel(tunnelId: string): void {
  const pair = activeTunnels.get(tunnelId);
  if (!pair) return;
  activeTunnels.delete(tunnelId);
  // Emit zero so the UI meter drops back to zero immediately
  levelEmitter.emit("level", tunnelId, 0);
  tryQuit(pair.input);
  tryQuit(pair.output);
}

export function getTunnelSampleRate(tunnelId: string): number | null {
  return activeTunnels.get(tunnelId)?.sampleRate ?? null;
}

export function setTunnelMuted(tunnelId: string, muted: boolean): void {
  activeTunnels.get(tunnelId)?.setMuted(muted);
}

export function destroyAllTunnels(): void {
  for (const id of [...activeTunnels.keys()]) destroyTunnel(id);
}

/** Recreates all currently active tunnels with a new buffer size. */
export function reloadAllTunnels(framesPerBuffer: number): void {
  const snapshot = [...activeTunnels.entries()].map(([id, pair]) => ({
    id,
    inputDeviceId: pair.inputDeviceId,
    outputDeviceId: pair.outputDeviceId,
  }));
  for (const { id, inputDeviceId, outputDeviceId } of snapshot) {
    createTunnel(id, inputDeviceId, outputDeviceId, framesPerBuffer);
  }
}
