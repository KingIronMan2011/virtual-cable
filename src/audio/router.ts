import { AudioIO, SampleFormat16Bit, getDevices } from "naudiodon";
import type { DeviceInfo } from "naudiodon";

interface StreamPair {
  input: InstanceType<typeof AudioIO>;
  output: InstanceType<typeof AudioIO>;
}

const activeTunnels = new Map<string, StreamPair>();

function tryQuit(stream: InstanceType<typeof AudioIO> | null): void {
  if (!stream) return;
  try {
    stream.quit();
  } catch {
    /* already closed */
  }
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

  const input = new AudioIO({
    inOptions: {
      channelCount: channels,
      sampleFormat: SampleFormat16Bit,
      sampleRate,
      deviceId: routingInputId,
      closeOnError: true,
    },
  });

  const output = new AudioIO({
    outOptions: {
      channelCount: channels,
      sampleFormat: SampleFormat16Bit,
      sampleRate,
      deviceId: routingOutputId,
      closeOnError: false,
    },
  });

  // Attach error handlers before starting — an unhandled 'error' event on a
  // Node stream crashes the process.
  input.on("error", (err: Error) => {
    console.error(`[tunnel:${tunnelId}] input error:`, err.message);
    destroyTunnel(tunnelId);
  });
  output.on("error", (err: Error) => {
    console.error(`[tunnel:${tunnelId}] output error:`, err.message);
    destroyTunnel(tunnelId);
  });

  input.pipe(output);
  output.start();
  input.start();

  activeTunnels.set(tunnelId, { input, output });
}

export function destroyTunnel(tunnelId: string): void {
  const pair = activeTunnels.get(tunnelId);
  if (!pair) return;
  activeTunnels.delete(tunnelId);
  tryQuit(pair.input);
  tryQuit(pair.output);
}

export function destroyAllTunnels(): void {
  for (const id of [...activeTunnels.keys()]) destroyTunnel(id);
}
