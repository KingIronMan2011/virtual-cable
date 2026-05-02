#!/usr/bin/env node
import sharp from "sharp";
import fs from "fs";
import path from "pathe";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PATH = path.resolve(__dirname, "../src-tauri/icons");

const ICONS = [
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
  { name: "StoreLogo.png", size: 50 },
];

async function buildIcons() {
  await Promise.all(
    ICONS.map(({ name, size }) =>
      sharp(`${PATH}/icon.svg`)
        .resize(size, size)
        .png()
        .toFile(path.join(PATH, name)),
    ),
  );

  console.log("✓ all icons built");
}

async function main() {
  fs.mkdirSync(PATH, { recursive: true });

  await buildIcons();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
