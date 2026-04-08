import { defineConfig } from "vite";

// Main process config — compiled to CommonJS for Electron.
// naudiodon and electron must be external: they are native/built-in
// and cannot be bundled by Rollup.
export default defineConfig({
  build: {
    rollupOptions: {
      external: ["electron", "naudiodon", "app-capture"],
      output: {
        // Prepend a module.paths patch so Node can resolve native modules that
        // were copied to resources/node_modules/ via extraResources. This runs
        // before any require() in the bundle, which is necessary because Rollup
        // emits require() calls at the top of the file for external modules.
        // packageAfterCopy hook copies native modules to resources/node_modules/.
        // Adding that path to module.paths lets require('naudiodon') resolve there,
        // and transitive deps (bindings → file-uri-to-path) resolve correctly too.
        banner: `;(function(){try{var a=require("electron").app;if(a&&a.isPackaged){module.paths.unshift(require("path").join(process.resourcesPath,"node_modules"));}}catch(_){}})();`,
      },
    },
  },
});
