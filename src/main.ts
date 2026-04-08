import { app, BrowserWindow, ipcMain, Tray, Menu, dialog } from "electron";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { getAudioDevices } from "./audio/devices";
import { listAudioApps } from "./audio/appCapture";
import {
  createTunnel,
  destroyTunnel,
  destroyAllTunnels,
  reloadAllTunnels,
  getTunnelSampleRate,
  getTunnelChannelCount,
  setTunnelMuted,
  setTunnelGain,
  setTunnelInputGain,
  setTunnelInputPriority,
  setTunnelDucking,
  levelEmitter,
} from "./audio/router";
import type { InputConfig, DuckingConfig } from "./audio/router";
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
import { sendAnalyticsEvent } from "./analytics/analytics";
import type { Tunnel } from "./types";
import type { AppSettings } from "./store/settingsStore";

// ── Squirrel install / uninstall (Windows only) ───────────────────────────────
// Squirrel launches the app briefly with a special arg to create/remove shortcuts.
// We handle it here so we can fire analytics before exiting.
async function handleSquirrelEvents(): Promise<void> {
  if (process.platform !== "win32") return;

  const squirrelEvent = process.argv[1];
  if (!squirrelEvent?.startsWith("--squirrel-")) return;

  // Shortcut management via the Squirrel Update.exe sitting one level up
  const updateExe = path.join(
    path.resolve(process.execPath, ".."),
    "..",
    "Update.exe",
  );
  const exeName = path.basename(process.execPath);
  const shortcut = (flag: string) => spawnSync(updateExe, [flag, exeName]);

  switch (squirrelEvent) {
    case "--squirrel-install":
      shortcut("--createShortcut");
      await sendAnalyticsEvent("registered");
      break;
    case "--squirrel-updated":
      shortcut("--createShortcut");
      break;
    case "--squirrel-uninstall":
      shortcut("--removeShortcut");
      await sendAnalyticsEvent("unregistered");
      break;
    // --squirrel-obsolete: no-op, just exit
  }

  process.exit(0);
}

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

  // Intercept close — hide to tray if the setting is on, otherwise kill immediately.
  win.on("close", (event) => {
    const settings = loadSettings();
    if (settings.minimizeToTray && !isQuitting) {
      event.preventDefault();
      win.hide();
    } else {
      process.exit(0);
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

ipcMain.handle("audio:getAudioApps", () => listAudioApps());

const effectiveFpb = (s: ReturnType<typeof loadSettings>) =>
  s.experimentalFeatures && s.expLatency ? s.bufferSize : 0;

ipcMain.handle(
  "audio:createTunnel",
  (
    _event,
    id: string,
    inputs: InputConfig[],
    outputId: number,
    channelCount: number | null,
    ducking: DuckingConfig,
  ) => {
    createTunnel(
      id,
      inputs,
      outputId,
      effectiveFpb(loadSettings()),
      channelCount,
      ducking,
    );
  },
);

ipcMain.handle("audio:getTunnelSampleRate", (_event, id: string) =>
  getTunnelSampleRate(id),
);

ipcMain.handle("audio:getTunnelChannelCount", (_event, id: string) =>
  getTunnelChannelCount(id),
);

ipcMain.handle("audio:setTunnelMuted", (_event, id: string, muted: boolean) => {
  setTunnelMuted(id, muted);
});

ipcMain.handle("audio:setTunnelGain", (_event, id: string, gain: number) => {
  setTunnelGain(id, gain);
});

ipcMain.handle(
  "audio:setTunnelInputGain",
  (_event, id: string, inputIndex: number, gain: number) => {
    setTunnelInputGain(id, inputIndex, gain);
  },
);

ipcMain.handle(
  "audio:setTunnelInputPriority",
  (_event, id: string, inputIndex: number, priority: boolean) => {
    setTunnelInputPriority(id, inputIndex, priority);
  },
);

ipcMain.handle(
  "audio:setTunnelDucking",
  (_event, id: string, ducking: DuckingConfig) => {
    setTunnelDucking(id, ducking);
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

ipcMain.handle("store:exportLayout", async (_event, json: string) => {
  const result = await dialog.showSaveDialog({
    title: "Export Cable Layout",
    defaultPath: "virtual-cable-layout.json",
    filters: [{ name: "Virtual Cable Layout", extensions: ["json"] }],
  });
  if (!result.canceled && result.filePath) {
    writeFileSync(result.filePath, json, "utf8");
    return true;
  }
  return false;
});

ipcMain.handle("store:importLayout", async () => {
  const result = await dialog.showOpenDialog({
    title: "Import Cable Layout",
    filters: [{ name: "Virtual Cable Layout", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (!result.canceled && result.filePaths[0]) {
    return readFileSync(result.filePaths[0], "utf8");
  }
  return null;
});

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

app.on("ready", async () => {
  // On Windows, install/uninstall analytics are handled via Squirrel events
  // (above). On macOS the app ships as a zip with no installer hooks, so we
  // use a first-launch flag file as a proxy for "installed".
  if (process.platform !== "win32") {
    const flagFile = path.join(app.getPath("userData"), "registered.flag");
    if (!existsSync(flagFile)) {
      writeFileSync(flagFile, "");
      sendAnalyticsEvent("registered");
    }
  }

  createWindow();
});

function forceQuit(): void {
  try {
    destroyAllTunnels();
  } catch {
    /* ignore */
  }
  try {
    tray?.destroy();
  } catch {
    /* ignore */
  }
  process.exit(0);
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") forceQuit();
});

app.on("before-quit", () => forceQuit());

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
