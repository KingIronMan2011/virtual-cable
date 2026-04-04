export interface AudioDevice {
  id: number;
  name: string;
  maxInputChannels: number;
  maxOutputChannels: number;
}

export interface Tunnel {
  id: string;
  name: string;
  inputDeviceId: number | null;
  outputDeviceId: number | null;
  active: boolean;
  muted: boolean;
}

export interface AudioIOOptions {
  channelCount: number;
  sampleFormat: number;
  sampleRate: number;
  framesPerBuffer?: number;
  deviceId: number;
  closeOnError: boolean;
}

export type BufferSize = 256 | 512 | 1024;

export interface AppSettings {
  autoUpdate: boolean;
  minimizeToTray: boolean;
  experimentalFeatures: boolean;
  expLatency: boolean;
  bufferSize: BufferSize;
  expSampleRate: boolean;
}

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "ready"
  | "error";

export interface UpdateState {
  status: UpdateStatus;
  version?: string;
  error?: string;
}

export type InstallState =
  | "idle"
  | "downloading"
  | "extracting"
  | "launching"
  | "done"
  | "error";

export type ProgressCallback = (
  stage: "downloading" | "extracting" | "launching",
  pct?: number,
) => void;
