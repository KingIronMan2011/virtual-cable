/**
 * fix-toolset.js
 *
 * Post-configure fixup: node-gyp's gyp generator sometimes writes "ClangCL"
 * as the PlatformToolset when the system's VS Build Tools default to Clang.
 * This script patches the generated .vcxproj to use "v143" (MSVC 2022)
 * before MSBuild runs.
 *
 * Called by: package.json "install" script between configure and build steps.
 */

const fs = require("fs");
const path = require("path");

const vcxproj = path.join(
  __dirname,
  "build",
  "virtual_cable_engine.vcxproj"
);

if (fs.existsSync(vcxproj)) {
  let content = fs.readFileSync(vcxproj, "utf8");
  const before = content;
  content = content.replace(
    /<PlatformToolset>ClangCL<\/PlatformToolset>/g,
    "<PlatformToolset>v143</PlatformToolset>"
  );
  if (content !== before) {
    fs.writeFileSync(vcxproj, content, "utf8");
    console.log("[fix-toolset] Patched PlatformToolset: ClangCL -> v143");
  } else {
    console.log("[fix-toolset] PlatformToolset already correct, no patch needed");
  }
} else {
  console.log("[fix-toolset] No vcxproj found (non-Windows or first run), skipping");
}
