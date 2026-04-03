import { getDevices } from "naudiodon";
import type { AudioDevice } from "../types";

// Names that PortAudio/MME exposes as generic placeholders — not real devices.
const JUNK_NAMES = [
  "primary sound driver",
  "primary sound capture driver",
  "microsoft sound mapper",
];

function isJunk(name: string): boolean {
  return JUNK_NAMES.some((j) => name.toLowerCase().includes(j));
}

export function getAudioDevices(): AudioDevice[] {
  const all = getDevices().filter((d) => d.id >= 0 && !isJunk(d.name));

  // Prefer WASAPI — it's the modern low-latency API on Windows and each physical
  // device appears exactly once under it (vs. MME/DirectSound which duplicate them).
  const wasapi = all.filter((d) => d.hostAPIName === "Windows WASAPI");
  const pool = wasapi.length > 0 ? wasapi : all;

  return pool.map(({ id, name, maxInputChannels, maxOutputChannels }) => ({
    id,
    name,
    maxInputChannels,
    maxOutputChannels,
  }));
}
