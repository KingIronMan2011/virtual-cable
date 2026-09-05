export interface AudioDevice {
  id: number;
  name: string;
  maxInputChannels: number;
  maxOutputChannels: number;
  isVirtual: boolean;
  virtualLabel: string | null;
}

export interface TunnelInput {
  /** PortAudio device ID, or null when appPid is set / nothing selected. */
  deviceId: number | null;
  /** Windows process ID for app loopback capture; null = device input. */
  appPid: number | null;
  /** Linear gain for this input source. 1.0 = unity. */
  gain: number;
  /** When true, this input can trigger ducking of non-priority inputs. */
  priority: boolean;
}

export interface Tunnel {
  id: string;
  name: string;
  inputs: TunnelInput[];
  outputDeviceId: number | null;
  active: boolean;
  muted: boolean;
  /** Explicit channel count, or null to auto-detect from device capabilities. */
  channelCount: number | null;
  /** Master linear gain applied after mixing. 1.0 = unity. */
  gain: number;
  /** Ducking: when a priority input exceeds –30 dBFS, non-priority inputs are attenuated. */
  duckingEnabled: boolean;
  /** Target linear gain for ducked non-priority inputs (0–1). e.g. 0.15 ≈ −16 dB. */
  duckingAmount: number;
  /** Ducking release time in milliseconds (how quickly non-priority inputs recover). */
  duckingRelease: number;
  /** Configurable hotkey to toggle this cable's active state. */
  hotkey: string | null;
}

export interface AudioIOOptions {
  channelCount: number;
  sampleFormat: number;
  sampleRate: number;
  framesPerBuffer?: number;
  deviceId: number;
  closeOnError: boolean;
}

export interface AppSettings {
  autoUpdate: boolean;
  minimizeToTray: boolean;
  launchOnStartup: boolean;
  hotkeys: {
    addCable: string;
    toggleSettings: string;
  };
}

export type UpdateStatus =
  "idle" | "checking" | "available" | "not-available" | "ready" | "error";

export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  error?: string;
}

export type InstallState =
  "idle" | "downloading" | "extracting" | "launching" | "done" | "error";

export type ProgressCallback = (
  stage: "downloading" | "extracting" | "launching",
  pct?: number,
) => void;
