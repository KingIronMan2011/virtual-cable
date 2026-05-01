#!/usr/bin/env node
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "pathe";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const icoFn = pngToIco.default ?? pngToIco;

const SVG = path.resolve(__dirname, "../assets/icon.svg");

// 🔥 WICHTIG: Zielordner (wie in deinem Screenshot)
const OUT = path.resolve(__dirname, "../src-tauri/icons");

const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512];

const EXTRA_ICONS = [
  { name: "32x32.png", size: 32 },
  { name: "128x128.png", size: 128 },
  { name: "128x128@2x.png", size: 256 },

  { name: "Square30x30Logo.png", size: 30 },
  { name: "Square44x44Logo.png", size: 44 },
  { name: "Square71x71Logo.png", size: 71 },
  { name: "Square89x89Logo.png", size: 89 },
  { name: "Square107x107Logo.png", size: 107 },
  { name: "Square142x142Logo.png", size: 142 },
  { name: "Square150x150Logo.png", size: 150 },
  { name: "Square284x284Logo.png", size: 284 },
  { name: "Square310x310Logo.png", size: 310 },

  { name: "StoreLogo.png", size: 50 }
];

async function buildIco() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vc-icons-"));
  try {
    const paths = await Promise.all(
      ICO_SIZES.map(async (s) => {
        const p = path.join(tmp, `icon-${s}.png`);
        await sharp(SVG).resize(s, s).png().toFile(p);
        return p;
      })
    );

    const ico = await icoFn(paths);
    fs.writeFileSync(path.join(OUT, "icon.ico"), ico);
    console.log("✓ icon.ico");
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
}

async function buildPng() {
  await sharp(SVG)
    .resize(512, 512)
    .png()
    .toFile(path.join(OUT, "icon.png"));

  console.log("✓ icon.png");
}

async function buildIcns() {
  if (process.platform !== "darwin") {
    console.log("⚠ icon.icns skipped (macOS only)");
    return;
  }

  const iconset = path.join(OUT, "icon.iconset");
  fs.mkdirSync(iconset, { recursive: true });

  await Promise.all(
    ICNS_SIZES.flatMap((s) => [
      sharp(SVG)
        .resize(s, s)
        .png()
        .toFile(path.join(iconset, `icon_${s}x${s}.png`)),
      sharp(SVG)
        .resize(s * 2, s * 2)
        .png()
        .toFile(path.join(iconset, `icon_${s}x${s}@2x.png`))
    ])
  );

  execFileSync("iconutil", [
    "-c",
    "icns",
    iconset,
    "-o",
    path.join(OUT, "icon.icns")
  ]);

  fs.rmSync(iconset, { recursive: true });
  console.log("✓ icon.icns");
}

async function buildExtraIcons() {
  await Promise.all(
    EXTRA_ICONS.map(({ name, size }) =>
      sharp(SVG)
        .resize(size, size)
        .png()
        .toFile(path.join(OUT, name))
    )
  );

  console.log("✓ extra icons");
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  await Promise.all([
    buildIco(),
    buildPng(),
    buildIcns(),
    buildExtraIcons()
  ]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
