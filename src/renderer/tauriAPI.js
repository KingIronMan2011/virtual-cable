import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
export const tauriAPI = {
  getDevices: () => invoke("get_devices"),
  getAudioApps: () => invoke("get_audio_apps"),
  createTunnel: (id, inputs, outputId, channelCount, ducking) =>
    invoke("create_tunnel", {
      id,
      inputs,
      outputId,
      channelCount,
      ducking,
    }),
  destroyTunnel: (id) => invoke("destroy_tunnel", { id }),
  // Mocked for now, or implement in Rust if needed
  checkVBAudioInstalled: () => Promise.resolve(true),
  installVBAudio: () => Promise.resolve(),
  downloadAndInstallVBAudio: () => Promise.resolve(),
  onVBAudioProgress: (cb) => () => {},
  loadTunnels: () => invoke("load_tunnels"),
  saveTunnels: (tunnels) => invoke("save_tunnels", { tunnels }),
  exportLayout: async (json) => {
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
  importLayout: async () => {
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
  loadSettings: () => invoke("load_settings"),
  saveSettings: (settings) => invoke("save_settings", { settings }),
  // Mocked updater for now
  checkForUpdates: () => Promise.resolve(),
  installUpdate: () => Promise.resolve(),
  getUpdateState: () => Promise.resolve({ status: "idle" }),
  onUpdateStatus: (cb) => () => {},
  getTunnelSampleRate: (id) => invoke("get_tunnel_sample_rate", { id }),
  getTunnelChannelCount: (id) => invoke("get_tunnel_channel_count", { id }),
  setTunnelMuted: (id, muted) => invoke("set_tunnel_muted", { id, muted }),
  setTunnelGain: (id, gain) => invoke("set_tunnel_gain", { id, gain }),
  setTunnelInputGain: (id, inputIndex, gain) =>
    invoke("set_tunnel_input_gain", { id, inputIndex, gain }),
  setTunnelInputPriority: (id, inputIndex, priority) =>
    invoke("set_tunnel_input_priority", { id, inputIndex, priority }),
  setTunnelDucking: (id, ducking) =>
    invoke("set_tunnel_ducking", { id, ...ducking }),
  onAudioLevel: (cb) => {
    let unsubPromise = listen("audio-level", (event) => {
      const [tunnelId, level] = event.payload;
      cb(tunnelId, level);
    });
    return () => {
      unsubPromise.then((unsub) => unsub());
    };
  },
};
//# sourceMappingURL=tauriAPI.js.map
