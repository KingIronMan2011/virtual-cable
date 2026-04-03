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
}
