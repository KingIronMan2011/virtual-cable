import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { shell } from "electron";
import https from "node:https";
import http from "node:http";
import AdmZip from "adm-zip";
import { getDevices } from "naudiodon";

const execFileAsync = promisify(execFile);

const VB_REGISTRY_KEYS = [
  "HKLM\\SYSTEM\\CurrentControlSet\\Services\\VBAudioVACMM",
  "HKLM\\SYSTEM\\CurrentControlSet\\Services\\VBAudioVACMM64",
  "HKLM\\SOFTWARE\\VB-Audio\\Cable",
];
const VB_DOWNLOAD_URL =
  "https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip";

export async function isVBAudioInstalled(): Promise<boolean> {
  // Primary check: does the CABLE audio device actually appear in PortAudio?
  // This is the ground truth — registry keys can be stale after an uninstall.
  try {
    const devices = getDevices();
    if (devices.some((d) => d.name.toLowerCase().includes("cable"))) {
      return true;
    }
  } catch {
    // naudiodon not ready yet — fall through to registry check
  }

  // Fallback: check known registry keys for the VB-Audio driver service
  for (const key of VB_REGISTRY_KEYS) {
    try {
      await execFileAsync("reg", ["query", key]);
      return true;
    } catch {
      // Key not present — try next
    }
  }

  return false;
}

/** Opens the VB-Audio download page as a fallback */
export async function openInstallPage(): Promise<void> {
  await shell.openExternal("https://www.vb-audio.com/Cable/");
}

import type { ProgressCallback } from "../types";

export type { ProgressCallback };

/**
 * Downloads the VB-Audio Cable zip, extracts it to a temp directory,
 * and launches the 64-bit setup exe (UAC handles elevation).
 */
export async function downloadAndInstall(
  onProgress: ProgressCallback,
): Promise<void> {
  const destDir = join(tmpdir(), `vbcable-${Date.now()}`);
  await mkdir(destDir, { recursive: true });

  const zipPath = join(destDir, "VBCABLE_Driver_Pack45.zip");

  // ── 1. Download ─────────────────────────────────────────────
  await new Promise<void>((resolve, reject) => {
    const get = (url: string) => {
      const mod = url.startsWith("https") ? https : http;
      mod
        .get(url, (res) => {
          // Follow redirects (301/302)
          if (
            (res.statusCode === 301 || res.statusCode === 302) &&
            res.headers.location
          ) {
            return get(res.headers.location);
          }
          if (res.statusCode !== 200) {
            return reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          }

          const total = parseInt(res.headers["content-length"] ?? "0", 10);
          let received = 0;
          const file = createWriteStream(zipPath);

          res.on("data", (chunk: Buffer) => {
            received += chunk.length;
            if (total > 0) {
              onProgress("downloading", Math.round((received / total) * 100));
            }
          });

          res.pipe(file);
          file.on("finish", () => file.close(() => resolve()));
          file.on("error", reject);
          res.on("error", reject);
        })
        .on("error", reject);
    };
    get(VB_DOWNLOAD_URL);
  });

  // ── 2. Extract ───────────────────────────────────────────────
  onProgress("extracting");
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(destDir, true);

  // ── 3. Find and launch the 64-bit setup exe ──────────────────
  onProgress("launching");
  const exeName =
    process.arch === "x64" ? "VBCABLE_Setup_x64.exe" : "VBCABLE_Setup.exe";
  const exePath = join(destDir, exeName);

  if (!existsSync(exePath)) {
    throw new Error(`Could not find ${exeName} in downloaded package.`);
  }
  await shell.openPath(exePath);
}
