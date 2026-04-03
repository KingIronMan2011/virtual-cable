import type { AudioDevice, Tunnel } from "../types";

declare global {
  interface Window {
    electronAPI: {
      getDevices(): Promise<AudioDevice[]>;
      createTunnel(
        id: string,
        inputId: number,
        outputId: number,
      ): Promise<void>;
      destroyTunnel(id: string): Promise<void>;
      checkVBAudioInstalled(): Promise<boolean>;
      installVBAudio(): Promise<void>;
      downloadAndInstallVBAudio(): Promise<void>;
      onVBAudioProgress(cb: (stage: string, pct?: number) => void): () => void;
      loadTunnels(): Promise<Tunnel[]>;
      saveTunnels(tunnels: Tunnel[]): Promise<void>;
    };
  }
}
