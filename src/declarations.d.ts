// Type declarations for packages that don't ship their own .d.ts files

declare module "naudiodon" {
  export interface DeviceInfo {
    id: number;
    name: string;
    maxInputChannels: number;
    maxOutputChannels: number;
    defaultSampleRate: number;
    hostAPIName: string;
  }

  export const SampleFormat8Bit: number;
  export const SampleFormat16Bit: number;
  export const SampleFormat24Bit: number;
  export const SampleFormat32Bit: number;
  export const SampleFormatFloat32: number;

  export function getDevices(): DeviceInfo[];

  export interface AudioIOOptions {
    inOptions?: {
      channelCount: number;
      sampleFormat: number;
      sampleRate: number;
      deviceId: number;
      closeOnError?: boolean;
    };
    outOptions?: {
      channelCount: number;
      sampleFormat: number;
      sampleRate: number;
      deviceId: number;
      closeOnError?: boolean;
    };
  }

  export class AudioIO {
    constructor(options: AudioIOOptions);
    start(): void;
    quit(): void;
    pipe(destination: AudioIO): AudioIO;
  }
}
