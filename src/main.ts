import { app, BrowserWindow, ipcMain, Tray, Menu } from "electron";
import path from "node:path";
import started from "electron-squirrel-startup";
import { getAudioDevices } from "./audio/devices";
import {
  createTunnel,
  destroyTunnel,
  destroyAllTunnels,
  reloadAllTunnels,
  getTunnelSampleRate,
  setTunnelMuted,
  levelEmitter,
} from "./audio/router";
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

let tray: Tray | null = null;
let isQuitting = false;

// In dev, assets live at <project>/assets/ relative to __dirname (/.vite/build/).
// When packaged, VitePlugin strips everything except .vite/ from the asar, so
// assets are copied to resources/assets/ via extraResource in forge.config.ts.
function assetPath(file: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "assets", file)
    : path.join(__dirname, "../../assets", file);
}

function createTray(win: BrowserWindow): void {
  const icon =
    process.platform === "darwin"
      ? assetPath("icon.png")
      : assetPath("icon.ico");

  tray = new Tray(icon);
  tray.setToolTip("Virtual Cable");

  const menu = Menu.buildFromTemplate([
    {
      label: "Show Virtual Cable",
      click: () => {
        win.show();
        win.focus();
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(menu);
  tray.on("click", () => {
    if (win.isVisible()) win.hide();
    else win.show();
  });
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 700,
    minHeight: 500,
    backgroundColor: "#0c0b09",
    icon: assetPath("icon.ico"),
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

  // Intercept close — hide to tray instead of quitting if the setting is on
  win.on("close", (event) => {
    if (isQuitting) return;
    const settings = loadSettings();
    if (settings.minimizeToTray) {
      event.preventDefault();
      win.hide();
    }
  });

  createTray(win);

  // Forward audio levels from the router to the renderer
  levelEmitter.on("level", (tunnelId: string, level: number) => {
    if (!win.isDestroyed())
      win.webContents.send("audio:level", tunnelId, level);
  });

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

const effectiveFpb = (s: ReturnType<typeof loadSettings>) =>
  s.experimentalFeatures && s.expLatency ? s.bufferSize : 0;

ipcMain.handle(
  "audio:createTunnel",
  (_event, id: string, inputId: number, outputId: number) => {
    createTunnel(id, inputId, outputId, effectiveFpb(loadSettings()));
  },
);

ipcMain.handle("audio:getTunnelSampleRate", (_event, id: string) =>
  getTunnelSampleRate(id),
);

ipcMain.handle("audio:setTunnelMuted", (_event, id: string, muted: boolean) => {
  setTunnelMuted(id, muted);
});

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

ipcMain.handle("settings:save", (_event, settings: AppSettings) => {
  const prev = loadSettings();
  saveSettings(settings);
  if (effectiveFpb(settings) !== effectiveFpb(prev)) {
    reloadAllTunnels(effectiveFpb(settings));
  }
});

ipcMain.handle("update:check", () => checkForUpdates());

ipcMain.handle("update:install", () => installUpdate());

ipcMain.handle("update:getState", () => getUpdateState());

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.on("ready", createWindow);

function cleanup(): void {
  // Guard against double-invocation (window-all-closed + before-quit can both
  // fire on the same quit path). Errors from native cleanup are swallowed so
  // that app.exit(0) is always reached.
  if (!isQuitting) isQuitting = true;
  try {
    destroyAllTunnels();
  } catch {
    /* naudiodon stream may already be closed */
  }
  try {
    tray?.destroy();
  } catch {
    /* tray may already be destroyed */
  }
  tray = null;
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    // Use app.exit() rather than app.quit() — quit() relies on the event loop
    // draining, which stalls when PortAudio callbacks or the Tray native handle
    // are still alive.
    cleanup();
    app.exit(0);
  }
});

app.on("before-quit", () => {
  // Reached when quitting via tray "Quit" or other app.quit() call paths.
  cleanup();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
