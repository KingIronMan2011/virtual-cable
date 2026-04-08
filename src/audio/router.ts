import { EventEmitter } from "node:events";
import { Transform, Writable } from "node:stream";
import { AudioIO, SampleFormat16Bit, getDevices } from "naudiodon";
import type { DeviceInfo } from "naudiodon";
import type { AudioIOOptions } from "../types";
import { AppCaptureReadable } from "./appCapture";

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

type AnyInputStream = InstanceType<typeof AudioIO> | AppCaptureReadable;

interface StreamPair {
  primaryInput: AnyInputStream;
  secondaryInputs: AnyInputStream[];
  output: InstanceType<typeof AudioIO>;
  /** Original (pre-resolve) input configs with current gains + priorities. */
  inputConfigs: InputConfig[];
  outputDeviceId: number;
  sampleRate: number;
  channelCount: number;
  duckingConfig: DuckingConfig;
  setMuted: (muted: boolean) => void;
  setGain: (gain: number) => void;
  setInputGain: (inputIndex: number, gain: number) => void;
  setInputPriority: (inputIndex: number, priority: boolean) => void;
  setDucking: (cfg: DuckingConfig) => void;
}

const activeTunnels = new Map<string, StreamPair>();

/** Emits `("level", tunnelId: string, level: number)` at ~20 fps per active tunnel. */
export const levelEmitter = new EventEmitter();

function tryQuit(stream: AnyInputStream | null): void {
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

/**
 * Applies gain to a 16-bit LE PCM buffer.
 * Returns the original buffer unchanged when gain === 1 (zero-copy).
 */
function applyGain(chunk: Buffer, gain: number): Buffer {
  if (gain === 1) return chunk;
  const out = Buffer.allocUnsafe(chunk.length);
  for (let i = 0; i + 1 < chunk.length; i += 2) {
    const s = Math.round(chunk.readInt16LE(i) * gain);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, s)), i);
  }
  return out;
}

/** Pass-through Transform that applies master gain, samples RMS level every
 *  50 ms, and replaces audio with silence when muted. */
function createMonitor(
  tunnelId: string,
  onLevel: (level: number) => void,
): {
  transform: Transform;
  setMuted: (muted: boolean) => void;
  setGain: (gain: number) => void;
} {
  let lastEmit = 0;
  let muted = false;
  let gain = 1;
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
      const processed = applyGain(chunk, gain);
      if (now - lastEmit >= 50) {
        lastEmit = now;
        onLevel(rmsLevel(processed));
      }
      cb(null, processed);
    },
  });
  return {
    transform,
    setMuted: (m: boolean) => {
      muted = m;
    },
    setGain: (g: number) => {
      gain = g;
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
  inputConfigs: InputConfig[],
  outputDeviceId: number,
  framesPerBuffer = 0,
  requestedChannels: number | null = null,
  ducking: DuckingConfig = { enabled: false, amount: 0.15, release: 1000 },
): void {
  if (activeTunnels.has(tunnelId)) destroyTunnel(tunnelId);
  if (inputConfigs.length === 0) return;

  const all = getDevices();
  const isApp = (cfg: InputConfig) => cfg.appPid != null;
  const routingInputIds = inputConfigs.map((c) =>
    isApp(c) ? 0 : resolveRoutingId(c.deviceId, all),
  );
  const routingOutputId = resolveRoutingId(outputDeviceId, all);

  // App inputs don't map to PortAudio devices; use output device capabilities.
  const primaryInputInfo = isApp(inputConfigs[0])
    ? undefined
    : all.find((d) => d.id === routingInputIds[0]);
  const outputInfo = all.find((d) => d.id === routingOutputId);

  const maxChannels = Math.min(
    primaryInputInfo?.maxInputChannels ?? outputInfo?.maxOutputChannels ?? 2,
    outputInfo?.maxOutputChannels ?? 2,
  );
  const channels =
    requestedChannels !== null
      ? Math.min(requestedChannels, maxChannels)
      : maxChannels;

  // App inputs always run at 48 kHz (Windows default mix rate).
  // Device inputs: prefer MME (48 kHz via Windows audio mixer) over WASAPI.
  const sampleRate = isApp(inputConfigs[0])
    ? 48000
    : primaryInputInfo?.hostAPIName === "MME" ||
        outputInfo?.hostAPIName === "MME"
      ? 48000
      : (outputInfo?.defaultSampleRate ??
        primaryInputInfo?.defaultSampleRate ??
        48000);

  const fpb = framesPerBuffer > 0 ? { framesPerBuffer } : {};

  const makeInOptions = (deviceId: number) => ({
    inOptions: {
      channelCount: channels,
      sampleFormat: SampleFormat16Bit,
      sampleRate,
      ...fpb,
      deviceId,
      closeOnError: true,
    } as AudioIOOptions,
  });

  // Per-input gain array — mutated in-place by setInputGain.
  const inputGains = inputConfigs.map((c) => c.gain);
  // Per-input priority array — mutated in-place by setInputPriority.
  const priorityMask = inputConfigs.map((c) => c.priority);

  // Ducking state — mutated in-place by setDucking.
  // Threshold is fixed at -30 dBFS (= 0.5 on the 0–1 normalised scale).
  const DUCK_THRESHOLD = 0.5;
  let duckEnabled = ducking.enabled;
  let duckAmount = ducking.amount;
  let duckReleaseMs = ducking.release;
  // Smoothed gain applied to non-priority inputs (1.0 = fully open, duckAmount = fully ducked).
  let duckGain = 1.0;

  // Per-secondary FIFO queues.
  // Decouples chunk sizes between primary (e.g. mic at ~10 ms) and secondary
  // (e.g. app capture at ~100 ms) so the mixer always advances through secondary
  // audio at the correct rate rather than replaying the same buffer repeatedly.
  const secQueues: Buffer[][] = Array.from(
    { length: Math.max(0, inputConfigs.length - 1) },
    () => [],
  );
  const secQueueBytes: number[] = new Array(
    Math.max(0, inputConfigs.length - 1),
  ).fill(0);
  // Cap each secondary queue at ~200 ms to prevent unbounded growth.
  const MAX_SEC_BYTES = Math.ceil(sampleRate * channels * 2 * 0.2);

  // Drain `needed` bytes from secondary queue `qi`, zero-padding if empty.
  function drainSecondary(qi: number, needed: number): Buffer {
    if (secQueueBytes[qi] === 0) return Buffer.alloc(needed, 0);
    const out = Buffer.allocUnsafe(needed);
    let written = 0;
    const q = secQueues[qi];
    while (written < needed && q.length > 0) {
      const head = q[0];
      const take = Math.min(needed - written, head.length);
      head.copy(out, written, 0, take);
      written += take;
      secQueueBytes[qi] -= take;
      if (take === head.length) {
        q.shift();
      } else {
        q[0] = head.subarray(take);
      }
    }
    if (written < needed) out.fill(0, written);
    return out;
  }

  const mixerTransform = new Transform({
    transform(primaryChunk: Buffer, _enc, cb) {
      // Drain exactly primaryChunk.length bytes from each secondary queue.
      // This advances each secondary stream in lock-step with the primary,
      // regardless of how large each source's individual chunks are.
      const secBuffers = secQueues.map((_, qi) =>
        drainSecondary(qi, primaryChunk.length),
      );

      // Ducking: determine whether any priority input is above threshold this chunk.
      const hasPriority = priorityMask.some((p) => p);
      const hasNonPriority = priorityMask.some((p) => !p);
      const canDuck = duckEnabled && hasPriority && hasNonPriority;

      if (canDuck) {
        let shouldDuck = false;
        if (priorityMask[0] && rmsLevel(primaryChunk) > DUCK_THRESHOLD) {
          shouldDuck = true;
        }
        if (!shouldDuck) {
          for (let s = 0; s < secBuffers.length; s++) {
            if (
              priorityMask[s + 1] &&
              rmsLevel(secBuffers[s]) > DUCK_THRESHOLD
            ) {
              shouldDuck = true;
              break;
            }
          }
        }
        // Exponential smoothing: attack = 20 ms fixed, release = user-configured.
        const frameCount = primaryChunk.length / 2 / channels;
        const chunkMs = (frameCount / sampleRate) * 1000;
        if (shouldDuck) {
          const alpha = Math.exp(-chunkMs / 20); // 20 ms attack
          duckGain = alpha * duckGain + (1 - alpha) * duckAmount;
        } else {
          const alpha = Math.exp(-chunkMs / Math.max(duckReleaseMs, 1));
          duckGain = alpha * duckGain + (1 - alpha) * 1.0;
          if (duckGain > 0.999) duckGain = 1.0; // snap to avoid drift
        }
      } else {
        duckGain = 1.0;
      }

      // Fast path: single input, unity gain, no ducking involved.
      if (inputGains.length === 1 && inputGains[0] === 1 && duckGain === 1.0) {
        cb(null, primaryChunk);
        return;
      }

      const result = Buffer.allocUnsafe(primaryChunk.length);
      for (let i = 0; i + 1 < primaryChunk.length; i += 2) {
        const g0 = priorityMask[0] ? inputGains[0] : inputGains[0] * duckGain;
        let sum =
          g0 === 1
            ? primaryChunk.readInt16LE(i)
            : Math.round(primaryChunk.readInt16LE(i) * g0);

        for (let s = 0; s < secBuffers.length; s++) {
          const gs = priorityMask[s + 1]
            ? inputGains[s + 1]
            : inputGains[s + 1] * duckGain;
          sum +=
            gs === 1
              ? secBuffers[s].readInt16LE(i)
              : Math.round(secBuffers[s].readInt16LE(i) * gs);
        }

        result.writeInt16LE(Math.max(-32768, Math.min(32767, sum)), i);
      }
      cb(null, result);
    },
  });

  const primaryInput: AnyInputStream = isApp(inputConfigs[0])
    ? new AppCaptureReadable(inputConfigs[0].appPid!, channels)
    : new AudioIO(makeInOptions(routingInputIds[0]));

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

  const {
    transform: monitor,
    setMuted,
    setGain,
  } = createMonitor(tunnelId, (level) => {
    levelEmitter.emit("level", tunnelId, level);
  });

  // Wire up secondary inputs — each feeds its latest chunk into the mixer buffer.
  // Secondary failures are non-fatal: the slot stays null (silence) and the
  // primary + other secondaries continue routing.
  const secondaryInputs: AnyInputStream[] = [];
  for (let i = 1; i < inputConfigs.length; i++) {
    const secInput: AnyInputStream = isApp(inputConfigs[i])
      ? new AppCaptureReadable(inputConfigs[i].appPid!, channels)
      : new AudioIO(makeInOptions(routingInputIds[i]));
    const secIndex = i - 1;
    const sink = new Writable({
      write(chunk: Buffer, _, done) {
        secQueues[secIndex].push(chunk);
        secQueueBytes[secIndex] += chunk.length;
        // If the queue grows beyond ~200 ms, drop the oldest chunk to stay
        // in sync rather than accumulating unbounded delay.
        while (
          secQueueBytes[secIndex] > MAX_SEC_BYTES &&
          secQueues[secIndex].length > 0
        ) {
          secQueueBytes[secIndex] -= secQueues[secIndex].shift()!.length;
        }
        done();
      },
    });
    (secInput as unknown as NodeJS.ReadableStream).pipe(sink);
    (secInput as unknown as NodeJS.EventEmitter).on("error", (err: Error) => {
      console.error(
        `[tunnel:${tunnelId}] secondary input ${i} error:`,
        err.message,
      );
    });
    secondaryInputs.push(secInput);
  }

  (primaryInput as unknown as NodeJS.EventEmitter).on("error", (err: Error) => {
    console.error(`[tunnel:${tunnelId}] primary input error:`, err.message);
    destroyTunnel(tunnelId);
  });
  (output as unknown as NodeJS.EventEmitter).on("error", (err: Error) => {
    console.error(`[tunnel:${tunnelId}] output error:`, err.message);
    destroyTunnel(tunnelId);
  });

  (primaryInput as unknown as NodeJS.ReadableStream)
    .pipe(mixerTransform)
    .pipe(monitor)
    .pipe(output as unknown as NodeJS.WritableStream);

  output.start();
  for (const sec of secondaryInputs) {
    (sec as unknown as { start(): void }).start();
  }
  (primaryInput as unknown as { start(): void }).start();

  // Store original (pre-resolve) device IDs so reloadAllTunnels can re-resolve
  // them correctly if device IDs shift after a rescan.
  const storedInputConfigs: InputConfig[] = inputConfigs.map((c, i) => ({
    deviceId: c.deviceId,
    appPid: c.appPid,
    gain: inputGains[i],
    priority: priorityMask[i],
  }));

  activeTunnels.set(tunnelId, {
    primaryInput,
    secondaryInputs,
    output,
    inputConfigs: storedInputConfigs,
    outputDeviceId,
    sampleRate,
    channelCount: channels,
    duckingConfig: { ...ducking },
    setMuted,
    setGain,
    setInputGain: (index: number, gain: number) => {
      if (index < inputGains.length) {
        inputGains[index] = gain;
        storedInputConfigs[index].gain = gain;
      }
    },
    setInputPriority: (index: number, priority: boolean) => {
      if (index < priorityMask.length) {
        priorityMask[index] = priority;
        storedInputConfigs[index].priority = priority;
      }
    },
    setDucking: (cfg: DuckingConfig) => {
      duckEnabled = cfg.enabled;
      duckAmount = cfg.amount;
      duckReleaseMs = cfg.release;
      // Reset smoothed gain when disabling so it doesn't linger at a reduced value.
      if (!cfg.enabled) duckGain = 1.0;
      activeTunnels.get(tunnelId)!.duckingConfig = { ...cfg };
    },
  });
}

export function destroyTunnel(tunnelId: string): void {
  const pair = activeTunnels.get(tunnelId);
  if (!pair) return;
  activeTunnels.delete(tunnelId);
  // Emit zero so the UI meter drops back to zero immediately
  levelEmitter.emit("level", tunnelId, 0);
  for (const sec of pair.secondaryInputs) tryQuit(sec);
  tryQuit(pair.primaryInput);
  tryQuit(pair.output);
}

export function getTunnelSampleRate(tunnelId: string): number | null {
  return activeTunnels.get(tunnelId)?.sampleRate ?? null;
}

export function getTunnelChannelCount(tunnelId: string): number | null {
  return activeTunnels.get(tunnelId)?.channelCount ?? null;
}

export function setTunnelMuted(tunnelId: string, muted: boolean): void {
  activeTunnels.get(tunnelId)?.setMuted(muted);
}

export function setTunnelGain(tunnelId: string, gain: number): void {
  activeTunnels.get(tunnelId)?.setGain(gain);
}

export function setTunnelInputGain(
  tunnelId: string,
  inputIndex: number,
  gain: number,
): void {
  activeTunnels.get(tunnelId)?.setInputGain(inputIndex, gain);
}

export function setTunnelInputPriority(
  tunnelId: string,
  inputIndex: number,
  priority: boolean,
): void {
  activeTunnels.get(tunnelId)?.setInputPriority(inputIndex, priority);
}

export function setTunnelDucking(tunnelId: string, cfg: DuckingConfig): void {
  activeTunnels.get(tunnelId)?.setDucking(cfg);
}

export function destroyAllTunnels(): void {
  for (const id of [...activeTunnels.keys()]) destroyTunnel(id);
}

/** Recreates all currently active tunnels with a new buffer size. */
export function reloadAllTunnels(framesPerBuffer: number): void {
  const snapshot = [...activeTunnels.entries()].map(([id, pair]) => ({
    id,
    inputConfigs: pair.inputConfigs,
    outputDeviceId: pair.outputDeviceId,
    channelCount: pair.channelCount,
    duckingConfig: pair.duckingConfig,
  }));
  for (const {
    id,
    inputConfigs,
    outputDeviceId,
    channelCount,
    duckingConfig,
  } of snapshot) {
    createTunnel(
      id,
      inputConfigs,
      outputDeviceId,
      framesPerBuffer,
      channelCount,
      duckingConfig,
    );
  }
}
