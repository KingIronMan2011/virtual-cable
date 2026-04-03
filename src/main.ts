import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { getAudioDevices } from "./audio/devices";
import { createTunnel, destroyTunnel, destroyAllTunnels } from "./audio/router";
import {
  isVBAudioInstalled,
  openInstallPage,
  downloadAndInstall,
} from "./vbaudio/installer";
import { loadTunnels, saveTunnels } from "./store/tunnelStore";
import type { Tunnel } from "./types";

// Handle Squirrel Windows installer events — quit immediately during install/update
if (started) app.quit();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    // Prevent white flash before React renders
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      // sandbox: false is required so the preload can access ipcRenderer from Electron.
      // contextIsolation: true still sandboxes the renderer — it cannot reach Node APIs.
      sandbox: false,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    win.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

ipcMain.handle("audio:getDevices", () => getAudioDevices());

ipcMain.handle(
  "audio:createTunnel",
  (_event, id: string, inputId: number, outputId: number) => {
    createTunnel(id, inputId, outputId);
  },
);

ipcMain.handle("audio:destroyTunnel", (_event, id: string) => {
  destroyTunnel(id);
});

ipcMain.handle("vbaudio:checkInstalled", () => isVBAudioInstalled());

ipcMain.handle("vbaudio:install", () => openInstallPage());

ipcMain.handle("vbaudio:downloadAndInstall", async (event) => {
  await downloadAndInstall((stage, pct) => {
    // Push progress events back to the renderer that made the call
    event.sender.send("vbaudio:progress", { stage, pct });
  });
});

ipcMain.handle("store:loadTunnels", () => loadTunnels());

ipcMain.handle("store:saveTunnels", (_event, tunnels: Tunnel[]) =>
  saveTunnels(tunnels),
);

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.on("ready", createWindow);

app.on("window-all-closed", () => {
  destroyAllTunnels();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => destroyAllTunnels());

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
