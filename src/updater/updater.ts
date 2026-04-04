import { autoUpdater, BrowserWindow, app } from "electron";
import type { UpdateStatus, UpdateState } from "../types";

export type { UpdateStatus, UpdateState };

let state: UpdateState = { status: "idle" };
let win: BrowserWindow | null = null;

function push(next: Partial<UpdateState>): void {
  state = { ...state, ...next };
  win?.webContents.send("update:status", state);
}

export function setupUpdater(mainWin: BrowserWindow): void {
  win = mainWin;

  // Squirrel is only available in a packaged build — skip silently in dev
  if (!app.isPackaged) return;

  // Replace with your Hazel deployment URL (e.g. https://your-hazel.vercel.app)
  const HAZEL_URL = "https://vc-upd.kingironman.dev";
  const feedUrl = `${HAZEL_URL}/update/${process.platform}/${app.getVersion()}`;

  try {
    autoUpdater.setFeedURL({ url: feedUrl });
  } catch (err) {
    console.error("[updater] setFeedURL failed:", err);
    return;
  }

  autoUpdater.on("checking-for-update", () => {
    push({ status: "checking" });
  });

  autoUpdater.on("update-available", () => {
    // Squirrel starts downloading automatically after this event
    push({ status: "available" });
  });

  autoUpdater.on("update-not-available", () => {
    push({ status: "not-available" });
    setTimeout(() => push({ status: "idle" }), 4000);
  });

  autoUpdater.on(
    "update-downloaded",
    (_event: Electron.Event, _releaseNotes: string, releaseName: string) => {
      push({ status: "ready", version: releaseName });
    },
  );

  autoUpdater.on("error", (err: Error) => {
    push({ status: "error", error: err.message });
  });
}

export function checkForUpdates(): void {
  if (!app.isPackaged) {
    push({ status: "not-available" });
    setTimeout(() => push({ status: "idle" }), 3000);
    return;
  }
  autoUpdater.checkForUpdates();
}

export function installUpdate(): void {
  autoUpdater.quitAndInstall();
}

export function getUpdateState(): UpdateState {
  return { ...state };
}
