import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { MakerDeb } from "@electron-forge/maker-deb";
import { MakerRpm } from "@electron-forge/maker-rpm";
import { VitePlugin } from "@electron-forge/plugin-vite";
import { FusesPlugin } from "@electron-forge/plugin-fuses";
import { FuseV1Options, FuseVersion } from "@electron/fuses";
import path from "node:path";
import { cp, mkdir } from "node:fs/promises";

// Native modules that must be present outside the asar at runtime.
// VitePlugin overrides packagerConfig.ignore to only keep .vite/ output, so
// node_modules never makes it into the asar. The packageAfterCopy hook below
// copies them into resources/node_modules/ in the staged package directory
// (before the asar is sealed), and the Rollup banner in vite.main.config.ts
// prepends that path to module.paths so require() finds them.
const NATIVE_MODULES = [
  "virtual-cable-engine",
];

const config: ForgeConfig = {
  packagerConfig: {
    icon: "./assets/icon",
    // Copy the assets directory into resources/assets/ so runtime icon paths
    // resolve correctly. VitePlugin strips everything except .vite/ from the
    // asar, so icons can't be referenced via __dirname in the packaged app.
    extraResource: ["assets"],
    asar: {
      // On Windows, @electron/asar evaluates `unpackDir` with path.relative()
      // which produces backslash paths — minimatch then fails to match forward-
      // slash patterns and nothing gets unpacked. `unpack` is evaluated with
      // matchBase:true against the full filename, which works on all platforms.
      //
      // Unpack .node binaries (can't be dlopen'd from inside an archive) and
      // .dll files (portaudio_x64.dll must be on the real filesystem so Windows
      // can LoadLibrary it from the same directory as naudiodon.node).
      unpack: "*.{node,dll}",
    },
  },
  rebuildConfig: {
    // Native modules must be compiled against Electron's ABI.
    onlyModules: ["virtual-cable-engine"],
    force: true,
  },
  hooks: {
    // afterCopy fires after app source files are staged but before the asar is
    // sealed. buildPath is the staged "app" directory (e.g. resources/app/).
    // Copying to "../node_modules" puts modules at resources/node_modules/,
    // which is where process.resourcesPath points — matching the banner path.
    packageAfterCopy: async (_config, buildPath) => {
      const destBase = path.join(buildPath, "..", "node_modules");
      await mkdir(destBase, { recursive: true });
      await Promise.all(
        NATIVE_MODULES.map((mod) =>
          cp(
            path.join(__dirname, "node_modules", mod),
            path.join(destBase, mod),
            { recursive: true },
          ),
        ),
      );
    },
  },
  makers: [
    new MakerSquirrel({
      name: "virtual_cable",
      authors: "KingIronMan2011",
      copyright: "2026 KingIronMan2011",
      description: "Virtual Audio Cable — route audio between apps",
    }),
    new MakerZIP({}, ["darwin"]),
    new MakerRpm({}),
    new MakerDeb({}),
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: "src/main.ts", config: "vite.main.config.ts", target: "main" },
        {
          entry: "src/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload",
        },
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
