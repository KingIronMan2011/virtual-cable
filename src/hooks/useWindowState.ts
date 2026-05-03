import { useEffect } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { tauriAPI } from "../tauriAPI";

export function useWindowState(loaded: boolean) {
  useEffect(() => {
    if (!loaded) return;

    (async () => {
      const appWindow = WebviewWindow.getCurrent();

      const saveWindowState = async () => {
        const pos = await appWindow.outerPosition();
        const size = await appWindow.outerSize();
        await tauriAPI.saveWindowState({
          x: Math.round(pos.x),
          y: Math.round(pos.y),
          width: Math.round(size.width),
          height: Math.round(size.height),
        });
      };

      let saveTimer: ReturnType<typeof setTimeout> | null = null;
      const debouncedSave = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(saveWindowState, 500);
      };

      const unlistenMove = await appWindow.onMoved(debouncedSave);
      const unlistenResize = await appWindow.onResized(debouncedSave);
      const unlistenCloseRequested =
        await appWindow.onCloseRequested(saveWindowState);

      return () => {
        unlistenMove();
        unlistenResize();
        unlistenCloseRequested();
        if (saveTimer) clearTimeout(saveTimer);
      };
    })();
  }, [loaded]);
}
