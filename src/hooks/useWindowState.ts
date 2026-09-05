import { useEffect } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { tauriAPI } from "../tauriAPI";

export function useWindowState(loaded: boolean) {
  useEffect(() => {
    if (!loaded) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    const listen = async () => {
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

      try {
        const [unlistenMove, unlistenResize, unlistenCloseRequested] =
          await Promise.all([
            appWindow.onMoved(debouncedSave),
            appWindow.onResized(debouncedSave),
            appWindow.onCloseRequested(saveWindowState),
          ]);

        const dispose = () => {
          unlistenMove();
          unlistenResize();
          unlistenCloseRequested();
          if (saveTimer) clearTimeout(saveTimer);
        };

        if (disposed) dispose();
        else cleanup = dispose;
      } catch (error) {
        console.error("Failed to restore window state listeners:", error);
      }
    };

    void listen();
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [loaded]);
}
