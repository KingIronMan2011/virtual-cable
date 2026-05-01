#!/usr/bin/env node
/**
 * Converts assets/icon.svg into the platform icon formats Electron Forge needs:
 *   assets/icon.ico   — Windows  (multi-size: 16, 32, 48, 64, 128, 256)
 *   assets/icon.icns  — macOS    (via macOS-only iconutil)
 *   assets/icon.png   — Linux    (512×512)
 *
 * Run:  node scripts/build-icons.js
 * Or:   npm run build:icons
 */

const sharp = require("sharp");
const pngToIco = require("png-to-ico");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const icoFn = pngToIco.default ?? pngToIco;

const SVG = path.resolve(__dirname, "../assets/icon.svg");
const OUT = path.resolve(__dirname, "../assets");

const ICO_SIZES = [16, 32, 48, 64, 128, 256];
const ICNS_SIZES = [16, 32, 64, 128, 256, 512];

async function buildIco() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vc-icons-"));
  try {
    const paths = await Promise.all(
      ICO_SIZES.map(async (s) => {
        const p = path.join(tmp, `icon-${s}.png`);
        await sharp(SVG).resize(s, s).png().toFile(p);
        return p;
      }),
    );
    const ico = await icoFn(paths);
    fs.writeFileSync(path.join(OUT, "icon.ico"), ico);
    console.log("✓ icon.ico");
  } finally {
    fs.rmSync(tmp, { recursive: true });
  }
}

async function buildPng() {
  await sharp(SVG).resize(512, 512).png().toFile(path.join(OUT, "icon.png"));
  console.log("✓ icon.png");
}

async function buildIcns() {
  if (process.platform !== "darwin") {
    console.log("⚠  icon.icns skipped (macOS only — runs in CI)");
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
        .toFile(path.join(iconset, `icon_${s}x${s}@2x.png`)),
    ]),
  );

  execFileSync("iconutil", [
    "-c",
    "icns",
    iconset,
    "-o",
    path.join(OUT, "icon.icns"),
  ]);
  fs.rmSync(iconset, { recursive: true });
  console.log("✓ icon.icns");
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await Promise.all([buildIco(), buildPng(), buildIcns()]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
