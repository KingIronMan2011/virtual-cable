import { useEffect, useCallback } from "react";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import type { AppSettings, Tunnel } from "../types";

export function useGlobalShortcuts(
  loaded: boolean,
  settings: AppSettings,
  tunnels: Tunnel[],
  addTunnel: () => void,
  setSettingsOpen: (open: boolean | ((prev: boolean) => boolean)) => void,
  toggleTunnelActive: (id: string) => void,
) {
  const isHotkeyMatch = useCallback(
    (e: KeyboardEvent, hotkeyStr: string | null) => {
      if (!hotkeyStr) return false;
      const parts = hotkeyStr.split("+").map((p) => p.trim().toLowerCase());
      const key = parts.pop();
      if (!key) return false;

      const eventKey = e.key.toLowerCase();
      if (eventKey !== key && e.code.toLowerCase() !== key) return false;

      const ctrl = parts.includes("ctrl");
      const shift = parts.includes("shift");
      const alt = parts.includes("alt");
      const meta = parts.includes("meta");

      return (
        e.ctrlKey === ctrl &&
        e.shiftKey === shift &&
        e.altKey === alt &&
        e.metaKey === meta
      );
    },
    [],
  );

  useEffect(() => {
    if (!loaded) return;

    let active = true;
    const syncShortcuts = async () => {
      try {
        await unregisterAll();
        if (!active) return;

        const toRegister: { key: string; action: () => void }[] = [];

        const normalize = (h: string) =>
          h
            .replace(/Ctrl/g, "Control")
            .replace(/\+,$/, "+Comma")
            .replace(/\+\.$/, "+Period")
            .replace(/\+\/$/, "+Slash")
            .replace(/\+\\$/, "+Backslash")
            .replace(/\+-$/, "+Minus")
            .replace(/\+=$/, "+Equal");

        if (settings.hotkeys.addCable) {
          toRegister.push({
            key: normalize(settings.hotkeys.addCable),
            action: addTunnel,
          });
        }
        if (settings.hotkeys.toggleSettings) {
          toRegister.push({
            key: normalize(settings.hotkeys.toggleSettings),
            action: () => setSettingsOpen((prev) => !prev),
          });
        }

        for (const t of tunnels) {
          if (t.hotkey) {
            toRegister.push({
              key: normalize(t.hotkey),
              action: () => toggleTunnelActive(t.id),
            });
          }
        }

        for (const { key, action } of toRegister) {
          try {
            await register(key, (event) => {
              if (event.state === "Pressed") {
                action();
              }
            });
          } catch (err) {
            console.error(`Failed to register global shortcut ${key}:`, err);
          }
        }
      } catch (err) {
        console.error("Failed to sync global shortcuts:", err);
      }
    };

    syncShortcuts();
    return () => {
      active = false;
      unregisterAll();
    };
  }, [
    loaded,
    settings.hotkeys,
    JSON.stringify(tunnels.map((t) => ({ id: t.id, hotkey: t.hotkey }))),
    addTunnel,
    setSettingsOpen,
    toggleTunnelActive,
  ]);

  // Local window shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSettingsOpen(false);
        return;
      }

      if (isHotkeyMatch(e, settings.hotkeys.addCable)) {
        e.preventDefault();
        addTunnel();
        return;
      }
      if (isHotkeyMatch(e, settings.hotkeys.toggleSettings)) {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
        return;
      }

      for (const t of tunnels) {
        if (isHotkeyMatch(e, t.hotkey)) {
          e.preventDefault();
          toggleTunnelActive(t.id);
          return;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    addTunnel,
    settings.hotkeys,
    isHotkeyMatch,
    toggleTunnelActive,
    tunnels,
    setSettingsOpen,
  ]);

  return { isHotkeyMatch };
}
