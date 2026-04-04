import { contextBridge, ipcRenderer } from "electron";
import type { AudioDevice, Tunnel } from "./types";
import type { AppSettings } from "./store/settingsStore";
import type { UpdateState } from "./updater/updater";

contextBridge.exposeInMainWorld("electronAPI", {
  getDevices: (): Promise<AudioDevice[]> =>
    ipcRenderer.invoke("audio:getDevices"),

  createTunnel: (
    id: string,
    inputId: number,
    outputId: number,
  ): Promise<void> =>
    ipcRenderer.invoke("audio:createTunnel", id, inputId, outputId),

  destroyTunnel: (id: string): Promise<void> =>
    ipcRenderer.invoke("audio:destroyTunnel", id),

  checkVBAudioInstalled: (): Promise<boolean> =>
    ipcRenderer.invoke("vbaudio:checkInstalled"),

  installVBAudio: (): Promise<void> => ipcRenderer.invoke("vbaudio:install"),

  downloadAndInstallVBAudio: (): Promise<void> =>
    ipcRenderer.invoke("vbaudio:downloadAndInstall"),

  onVBAudioProgress: (
    cb: (stage: string, pct?: number) => void,
  ): (() => void) => {
    const listener = (_: unknown, data: { stage: string; pct?: number }) =>
      cb(data.stage, data.pct);
    ipcRenderer.on("vbaudio:progress", listener);
    return () => ipcRenderer.removeListener("vbaudio:progress", listener);
  },

  loadTunnels: (): Promise<Tunnel[]> => ipcRenderer.invoke("store:loadTunnels"),

  saveTunnels: (tunnels: Tunnel[]): Promise<void> =>
    ipcRenderer.invoke("store:saveTunnels", tunnels),

  loadSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:load"),

  saveSettings: (settings: AppSettings): Promise<void> =>
    ipcRenderer.invoke("settings:save", settings),

  checkForUpdates: (): Promise<void> => ipcRenderer.invoke("update:check"),

  installUpdate: (): Promise<void> => ipcRenderer.invoke("update:install"),

  getUpdateState: (): Promise<UpdateState> =>
    ipcRenderer.invoke("update:getState"),

  onUpdateStatus: (cb: (state: UpdateState) => void): (() => void) => {
    const listener = (_: unknown, state: UpdateState) => cb(state);
    ipcRenderer.on("update:status", listener);
    return () => ipcRenderer.removeListener("update:status", listener);
  },

  getTunnelSampleRate: (id: string): Promise<number | null> =>
    ipcRenderer.invoke("audio:getTunnelSampleRate", id),

  setTunnelMuted: (id: string, muted: boolean): Promise<void> =>
    ipcRenderer.invoke("audio:setTunnelMuted", id, muted),

  onAudioLevel: (
    cb: (tunnelId: string, level: number) => void,
  ): (() => void) => {
    const listener = (_: unknown, tunnelId: string, level: number) =>
      cb(tunnelId, level);
    ipcRenderer.on("audio:level", listener);
    return () => ipcRenderer.removeListener("audio:level", listener);
  },
});
