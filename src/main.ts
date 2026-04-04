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
import { loadSettings, saveSettings } from "./store/settingsStore";
import {
  setupUpdater,
  checkForUpdates,
  installUpdate,
  getUpdateState,
} from "./updater/updater";
import type { Tunnel } from "./types";
import type { AppSettings } from "./store/settingsStore";

if (started) app.quit();

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: "#0c0b09",
    icon: path.join(__dirname, "../../assets/icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
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

  // Set up auto-updater after window is ready
  setupUpdater(win);

  // Run auto-update check on startup if the user has it enabled
  win.webContents.once("did-finish-load", () => {
    const settings = loadSettings();
    if (settings.autoUpdate) {
      checkForUpdates();
    }
  });
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
    event.sender.send("vbaudio:progress", { stage, pct });
  });
});

ipcMain.handle("store:loadTunnels", () => loadTunnels());

ipcMain.handle("store:saveTunnels", (_event, tunnels: Tunnel[]) =>
  saveTunnels(tunnels),
);

ipcMain.handle("settings:load", () => loadSettings());

ipcMain.handle("settings:save", (_event, settings: AppSettings) =>
  saveSettings(settings),
);

ipcMain.handle("update:check", () => checkForUpdates());

ipcMain.handle("update:install", () => installUpdate());

ipcMain.handle("update:getState", () => getUpdateState());

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
