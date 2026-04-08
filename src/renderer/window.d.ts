import type { AudioDevice, Tunnel } from "../types";
import type { AppSettings } from "../store/settingsStore";
import type { UpdateState } from "../updater/updater";

declare global {
  interface Window {
    electronAPI: {
      getDevices(): Promise<AudioDevice[]>;
      getAudioApps(): Promise<{ pid: number; name: string; exe: string }[]>;
      createTunnel(
        id: string,
        inputs: { deviceId: number; appPid?: number; gain: number; priority: boolean }[],
        outputId: number,
        channelCount: number | null,
        ducking: { enabled: boolean; amount: number; release: number },
      ): Promise<void>;
      destroyTunnel(id: string): Promise<void>;
      checkVBAudioInstalled(): Promise<boolean>;
      installVBAudio(): Promise<void>;
      downloadAndInstallVBAudio(): Promise<void>;
      onVBAudioProgress(cb: (stage: string, pct?: number) => void): () => void;
      loadTunnels(): Promise<Tunnel[]>;
      exportLayout(json: string): Promise<boolean>;
      importLayout(): Promise<string | null>;
      saveTunnels(tunnels: Tunnel[]): Promise<void>;
      loadSettings(): Promise<AppSettings>;
      saveSettings(settings: AppSettings): Promise<void>;
      checkForUpdates(): Promise<void>;
      installUpdate(): Promise<void>;
      getUpdateState(): Promise<UpdateState>;
      onUpdateStatus(cb: (state: UpdateState) => void): () => void;
      getTunnelSampleRate(id: string): Promise<number | null>;
      getTunnelChannelCount(id: string): Promise<number | null>;
      setTunnelMuted(id: string, muted: boolean): Promise<void>;
      setTunnelGain(id: string, gain: number): Promise<void>;
      setTunnelInputGain(id: string, inputIndex: number, gain: number): Promise<void>;
      setTunnelInputPriority(id: string, inputIndex: number, priority: boolean): Promise<void>;
      setTunnelDucking(
        id: string,
        ducking: { enabled: boolean; amount: number; release: number },
      ): Promise<void>;
      onAudioLevel(cb: (tunnelId: string, level: number) => void): () => void;
    };
  }
}
