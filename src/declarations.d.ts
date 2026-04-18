// Type declarations for packages that don't ship their own .d.ts files

declare module "virtual-cable-engine" {
  interface AudioDevice {
    id: number;
    name: string;
    maxInputChannels: number;
    maxOutputChannels: number;
  }

  interface InputConfig {
    deviceId: number;
    appPid?: number;
    gain: number;
    priority: boolean;
  }

  interface DuckingConfig {
    enabled: boolean;
    amount: number;
    release: number;
  }

  interface AudioApp {
    pid: number;
    name: string;
    exe: string;
  }

  export function getAudioDevices(): AudioDevice[];
  export function listAudioApps(): AudioApp[];
  export function createTunnel(
    tunnelId: string,
    inputs: InputConfig[],
    outputDeviceId: number,
    framesPerBuffer: number,
    channelCount: number,
    ducking: DuckingConfig,
  ): void;
  export function destroyTunnel(tunnelId: string): void;
  export function destroyAllTunnels(): void;
  export function reloadAllTunnels(framesPerBuffer: number): void;
  export function setTunnelMuted(tunnelId: string, muted: boolean): void;
  export function setTunnelGain(tunnelId: string, gain: number): void;
  export function setTunnelInputGain(
    tunnelId: string,
    inputIndex: number,
    gain: number,
  ): void;
  export function setTunnelInputPriority(
    tunnelId: string,
    inputIndex: number,
    priority: boolean,
  ): void;
  export function setTunnelDucking(
    tunnelId: string,
    ducking: DuckingConfig,
  ): void;
  export function getTunnelSampleRate(tunnelId: string): number | null;
  export function getTunnelChannelCount(tunnelId: string): number | null;
  export function registerLevelCallback(
    cb: (tunnelId: string, level: number) => void,
  ): void;
}
