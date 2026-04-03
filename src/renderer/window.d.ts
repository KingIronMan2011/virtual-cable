import type { AudioDevice, Tunnel } from "../types";
import type { AppSettings } from "../store/settingsStore";
import type { UpdateState } from "../updater/updater";

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
      loadSettings(): Promise<AppSettings>;
      saveSettings(settings: AppSettings): Promise<void>;
      checkForUpdates(): Promise<void>;
      installUpdate(): Promise<void>;
      getUpdateState(): Promise<UpdateState>;
      onUpdateStatus(cb: (state: UpdateState) => void): () => void;
    };
  }
}
