import { contextBridge, ipcRenderer } from "electron";
import type { AudioDevice, Tunnel } from "./types";

// Expose a typed, narrow API to the renderer. The renderer cannot call ipcRenderer
// directly — it can only use what is explicitly exposed here via contextBridge.
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
    // Return an unsubscribe function so the renderer can clean up
    return () => ipcRenderer.removeListener("vbaudio:progress", listener);
  },

  loadTunnels: (): Promise<Tunnel[]> => ipcRenderer.invoke("store:loadTunnels"),

  saveTunnels: (tunnels: Tunnel[]): Promise<void> =>
    ipcRenderer.invoke("store:saveTunnels", tunnels),
});
