import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import type { AudioDevice, Tunnel, AppSettings, UpdateState } from "./types";

export const tauriAPI = {
  getDevices: (): Promise<AudioDevice[]> => invoke("get_devices"),

  getAudioApps: (): Promise<{ pid: number; name: string; exe: string }[]> =>
    invoke("get_audio_apps"),

  createTunnel: (
    id: string,
    inputs: {
      deviceId: number | null;
      appPid?: number | null;
      gain: number;
      priority: boolean;
    }[],
    outputId: number | null,
    channelCount: number | null,
    ducking: { enabled: boolean; amount: number; release: number },
  ): Promise<void> =>
    invoke("create_tunnel", {
      id,
      inputs,
      outputId,
      channelCount,
      ducking,
    }),

  destroyTunnel: (id: string): Promise<void> =>
    invoke("destroy_tunnel", { id }),

  // Mocked for now, or implement in Rust if needed
  checkVBAudioInstalled: (): Promise<boolean> => Promise.resolve(true),
  installVBAudio: (): Promise<void> => Promise.resolve(),
  downloadAndInstallVBAudio: (): Promise<void> => Promise.resolve(),
  onVBAudioProgress: (_cb: (stage: string, pct?: number) => void) => () => {},

  loadTunnels: (): Promise<Tunnel[]> => invoke("load_tunnels"),
  saveTunnels: (tunnels: Tunnel[]): Promise<void> =>
    invoke("save_tunnels", { tunnels }),

  exportLayout: async (json: string): Promise<boolean> => {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      filters: [{ name: "JSON", extensions: ["json"] }],
      defaultPath: "layout.json",
    });
    if (path) {
      await writeTextFile(path, json);
      return true;
    }
    return false;
  },

  importLayout: async (): Promise<string | null> => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await open({
      filters: [{ name: "JSON", extensions: ["json"] }],
      multiple: false,
    });
    if (path && typeof path === "string") {
      return await readTextFile(path);
    }
    return null;
  },

  loadSettings: (): Promise<AppSettings> => invoke("load_settings"),
  saveSettings: (settings: AppSettings): Promise<void> =>
    invoke("save_settings", { settings }),

  // Updater plugin
  checkForUpdates: async (): Promise<UpdateState> => {
    try {
      const update = await check();
      if (!update) {
        return { status: "not-available" };
      }
      if (update.available) {
        return { status: "available", version: update.version };
      }
      return { status: "not-available" };
    } catch (error) {
      return { 
        status: "error", 
        error: error instanceof Error ? error.message : "Update check failed" 
      };
    }
  },
  
  installUpdate: async (): Promise<void> => {
    const update = await check();
    if (update) {
      await update.downloadAndInstall();
    }
  },
  
  getUpdateState: async (): Promise<UpdateState> => {
    const update = await check();
    if (!update) {
      return { status: "idle" };
    }
    if (update.available) {
      return { status: "available", version: update.version };
    }
    return { status: "not-available" };
  },
  
  onUpdateStatus: (_cb: (state: UpdateState) => void) => () => {},

  getTunnelSampleRate: (id: string): Promise<number | null> =>
    invoke("get_tunnel_sample_rate", { id }),

  getTunnelChannelCount: (id: string): Promise<number | null> =>
    invoke("get_tunnel_channel_count", { id }),

  setTunnelMuted: (id: string, muted: boolean): Promise<void> =>
    invoke("set_tunnel_muted", { id, muted }),

  setTunnelGain: (id: string, gain: number): Promise<void> =>
    invoke("set_tunnel_gain", { id, gain }),

  setTunnelInputGain: (
    id: string,
    inputIndex: number,
    gain: number,
  ): Promise<void> => invoke("set_tunnel_input_gain", { id, inputIndex, gain }),

  setTunnelInputPriority: (
    id: string,
    inputIndex: number,
    priority: boolean,
  ): Promise<void> =>
    invoke("set_tunnel_input_priority", { id, inputIndex, priority }),

  setTunnelDucking: (
    id: string,
    ducking: { enabled: boolean; amount: number; release: number },
  ): Promise<void> => invoke("set_tunnel_ducking", { id, ...ducking }),

  onAudioLevel: (
    cb: (tunnelId: string, level: number) => void,
  ): (() => void) => {
    const unsubPromise = listen("audio-level", (event: unknown) => {
      const payload = (event as { payload: [string, number] }).payload;
      const [tunnelId, level] = payload;
      cb(tunnelId, level);
    });
    return () => {
      unsubPromise.then((unsub) => unsub());
    };
  },
};
