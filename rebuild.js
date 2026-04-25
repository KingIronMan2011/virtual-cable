/**
 * rebuild.js
 *
 * Replaces `electron-rebuild` for the virtual-cable-engine addon.
 *
 * Steps:
 *   1. Find the Electron version and its node ABI headers
 *   2. Run node-gyp configure with Electron's headers
 *   3. Patch ClangCL → v143 in the generated vcxproj (if needed)
 *   4. Run node-gyp build
 *
 * This avoids the issue where electron-rebuild does a single `rebuild`
 * (configure + build) with no hook point between the two steps.
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

/* ── Locate Electron ──────────────────────────────────────────────────── */

let electronVersion;
try {
  electronVersion = require("electron/package.json").version;
} catch {
  console.log("[rebuild] electron not found, skipping native rebuild");
  process.exit(0);
}

console.log(`[rebuild] Electron v${electronVersion}`);

const addonDir = path.join(
  __dirname,
  "src",
  "native",
  "virtual-cable-engine"
);
const nodeGyp = path.join(
  __dirname,
  "node_modules",
  "@electron",
  "node-gyp",
  "bin",
  "node-gyp.js"
);
const nodeGypBin = fs.existsSync(nodeGyp)
  ? `node "${nodeGyp}"`
  : "node-gyp";

/* ── Step 1: Configure ────────────────────────────────────────────────── */

console.log("[rebuild] Step 1/3: node-gyp configure");
execSync(
  `${nodeGypBin} configure --target=${electronVersion} --arch=x64 --dist-url=https://electronjs.org/headers`,
  { cwd: addonDir, stdio: "inherit" }
);

/* ── Step 2: Patch ClangCL → v143 ─────────────────────────────────────── */

console.log("[rebuild] Step 2/3: fix-toolset");
const vcxproj = path.join(
  addonDir,
  "build",
  "virtual_cable_engine.vcxproj"
);
if (fs.existsSync(vcxproj)) {
  let content = fs.readFileSync(vcxproj, "utf8");
  const patched = content.replace(
    /<PlatformToolset>ClangCL<\/PlatformToolset>/g,
    "<PlatformToolset>v143</PlatformToolset>"
  );
  if (patched !== content) {
    fs.writeFileSync(vcxproj, patched, "utf8");
    console.log("[rebuild]   Patched PlatformToolset: ClangCL -> v143");
  } else {
    console.log("[rebuild]   PlatformToolset already v143, no patch needed");
  }
}

/* ── Step 3: Build ────────────────────────────────────────────────────── */

console.log("[rebuild] Step 3/3: node-gyp build");
execSync(`${nodeGypBin} build`, {
  cwd: addonDir,
  stdio: "inherit",
});

console.log("[rebuild] Done!");
