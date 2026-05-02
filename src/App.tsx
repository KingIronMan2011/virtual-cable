import { useEffect, useState, useCallback, useRef } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { register, unregisterAll } from "@tauri-apps/plugin-global-shortcut";
import { LogicalPosition, LogicalSize } from "@tauri-apps/api/dpi";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Hexagon,
  Plus,
  RefreshCw,
  Settings,
  Upload,
  X,
} from "lucide-react";
import type {
  AudioDevice,
  Tunnel,
  TunnelInput,
  InstallState,
  AppSettings,
} from "./types";
import TunnelList from "./components/TunnelList";
import VBInstallModal from "./components/VBInstallModal";
import SettingsPanel from "./components/SettingsPanel";
import { tauriAPI } from "./tauriAPI";

const SETTINGS_DEFAULTS: AppSettings = {
  autoUpdate: false,
  minimizeToTray: false,
  launchOnStartup: false,
  experimentalFeatures: false,
  expLatency: false,
  bufferSize: 512,
  hotkeys: {
    addCable: "Ctrl+Alt+N",
    toggleSettings: "Ctrl+Alt+,",
  },
};

export default function App() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [audioApps, setAudioApps] = useState<
    { pid: number; name: string; exe: string }[]
  >([]);
  const [tunnels, setTunnels] = useState<Tunnel[]>([]);
  const [settings, setSettings] = useState<AppSettings>(SETTINGS_DEFAULTS);
  const [vbInstalled, setVbInstalled] = useState<boolean | null>(null);
  const [vbModalOpen, setVbModalOpen] = useState(false);
  const [vbToastDismissed, setVbToastDismissed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [installState, setInstallState] = useState<InstallState>("idle");
  const [installPct, setInstallPct] = useState(0);
  const [installError, setInstallError] = useState("");
  const loaded = useRef(false);
  // Per-tunnel serial queue — each call chains off the previous so IPC messages
  // for the same tunnel always arrive in the order the user triggered them.
  const updateQueues = useRef(new Map<string, Promise<void>>());
  // Mirror of `tunnels` state, updated synchronously on every render.
  // Queue operations read from this ref at execution time (after all prior async
  // IPC calls resolve and React has re-rendered), so they always see fresh state.
  const tunnelsRef = useRef<Tunnel[]>([]);
  tunnelsRef.current = tunnels;
  const settingsRef = useRef<AppSettings>(settings);
  settingsRef.current = settings;

  useEffect(() => {
    Promise.all([
      tauriAPI.getDevices(),
      tauriAPI.loadTunnels(),
      tauriAPI.checkVBAudioInstalled(),
      tauriAPI.loadSettings(),
      tauriAPI.getAudioApps(),
      tauriAPI.loadWindowState(),
    ]).then(([devs, saved, installed, s, apps, windowState]) => {
      setDevices(devs);
      setAudioApps(apps);
      // Ensure tunnels start in an inactive state upon app launch
      setTunnels(
        saved.map((t, index) => ({
          ...t,
          active: false,
          muted: false,
          hotkey:
            t.hotkey === undefined
              ? index < 9
                ? `Ctrl+Alt+Numpad${index + 1}`
                : null
              : t.hotkey,
        })),
      );
      setVbInstalled(installed);
      setSettings((prev) => ({
        ...prev,
        ...s,
        hotkeys: {
          ...prev.hotkeys,
          ...(s.hotkeys || {}),
        },
      }));

      // Restore window state if it exists
      if (windowState) {
        (async () => {
          const appWindow = WebviewWindow.getCurrent();
          await appWindow.setPosition(
            new LogicalPosition(windowState.x, windowState.y),
          );
          await appWindow.setSize(
            new LogicalSize(windowState.width, windowState.height),
          );
        })();
      }

      loaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    // Always save tunnels as inactive so they don't auto-start on next launch
    const toSave = tunnels.map((t) => ({ ...t, active: false, muted: false }));
    tauriAPI.saveTunnels(toSave);
  }, [tunnels]);

  // Listen for window move/resize and save state
  useEffect(() => {
    if (!loaded.current) return;

    (async () => {
      const appWindow = WebviewWindow.getCurrent();

      // Save window state on move or resize
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

      // Debounce the save to avoid too frequent writes
      let saveTimer: ReturnType<typeof setTimeout> | null = null;
      const debouncedSave = () => {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(saveWindowState, 500);
      };

      // Listen for move and resize events
      const unlistenMove = await appWindow.onMoved(debouncedSave);
      const unlistenResize = await appWindow.onResized(debouncedSave);

      // Save on window close
      const unlistenCloseRequested =
        await appWindow.onCloseRequested(saveWindowState);

      return () => {
        unlistenMove();
        unlistenResize();
        unlistenCloseRequested();
        if (saveTimer) clearTimeout(saveTimer);
      };
    })();
  }, []);

  // Poll for newly started audio apps every 3 s so the user doesn't need to restart.
  useEffect(() => {
    const id = setInterval(async () => {
      const apps = await tauriAPI.getAudioApps();
      setAudioApps((prev) => {
        if (
          prev.length === apps.length &&
          prev.every((p, i) => p.pid === apps[i].pid)
        )
          return prev;
        return apps;
      });
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const addTunnel = useCallback(() => {
    setTunnels((prev) => {
      const n = prev.length + 1;
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: `Cable ${String(n).padStart(2, "0")}`,
          inputs: [{ deviceId: null, appPid: null, gain: 1, priority: false }],
          outputDeviceId: null,
          active: false,
          muted: false,
          channelCount: null,
          gain: 1,
          duckingEnabled: false,
          duckingAmount: 0.15,
          duckingRelease: 1000,
          hotkey: n <= 9 ? `Ctrl+Alt+Numpad${n}` : null,
        },
      ];
    });
  }, []);

  const isHotkeyMatch = useCallback(
    (e: KeyboardEvent, hotkeyStr: string | null) => {
      if (!hotkeyStr) return false;
      const parts = hotkeyStr.split("+").map((p) => p.trim().toLowerCase());
      const key = parts.pop();
      if (!key) return false;

      // Handle special keys
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

  const deleteTunnel = useCallback(async (id: string) => {
    await tauriAPI.destroyTunnel(id);
    setTunnels((prev) => prev.filter((t) => t.id !== id));
    updateQueues.current.delete(id);
  }, []);

  // Enqueue an async operation for a tunnel onto its serial queue.
  // One failure swallows so it doesn't stall subsequent operations.
  const enqueue = useCallback((id: string, op: () => Promise<void>) => {
    const tail = (updateQueues.current.get(id) ?? Promise.resolve()).then(op);
    updateQueues.current.set(id, tail.catch(console.error));
  }, []);

  // Device-change: always deactivates the tunnel, no IPC needed beyond destroy.
  const updateTunnel = useCallback(
    (updated: Tunnel) => {
      enqueue(updated.id, async () => {
        setTunnels((ts) => ts.map((t) => (t.id === updated.id ? updated : t)));
        await tauriAPI.destroyTunnel(updated.id);
      });
    },
    [enqueue],
  );

  // Toggle active — reads from tunnelsRef at execution time so it always sees
  // the state committed by all previously-resolved queue operations.
  const toggleTunnelActive = useCallback(
    (id: string) => {
      enqueue(id, async () => {
        const current = tunnelsRef.current.find((t) => t.id === id);
        if (!current) return;
        const next: Tunnel = {
          ...current,
          active: !current.active,
          // clear mute when going offline so it doesn't persist into next session
          muted: current.active ? false : current.muted,
        };
        setTunnels((ts) => ts.map((t) => (t.id === id ? next : t)));
        // An input is "ready" if it has either a device or an app selected.
        const readyInputs = next.inputs.filter(
          (inp) => inp.deviceId !== null || inp.appPid !== null,
        );
        if (
          next.active &&
          readyInputs.length > 0 &&
          next.outputDeviceId !== null
        ) {
          await tauriAPI.createTunnel(
            next.id,
            readyInputs.map((inp) => ({
              deviceId: inp.deviceId ?? 0,
              appPid: inp.appPid ?? undefined,
              gain: inp.gain,
              priority: inp.priority,
            })),
            next.outputDeviceId,
            next.channelCount,
            {
              enabled: next.duckingEnabled,
              amount: next.duckingAmount,
              release: next.duckingRelease,
            },
          );
          await tauriAPI.setTunnelMuted(next.id, next.muted);
        } else {
          await tauriAPI.destroyTunnel(next.id);
        }
      });
    },
    [enqueue, isHotkeyMatch],
  );

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape: Close Settings (always active)
      if (e.key === "Escape") {
        setSettingsOpen(false);
        return;
      }

      // Check global configurable hotkeys
      const s = settingsRef.current;
      if (isHotkeyMatch(e, s.hotkeys.addCable)) {
        e.preventDefault();
        addTunnel();
        return;
      }
      if (isHotkeyMatch(e, s.hotkeys.toggleSettings)) {
        e.preventDefault();
        setSettingsOpen((prev) => !prev);
        return;
      }

      // Check tunnel-specific hotkeys
      for (const t of tunnelsRef.current) {
        if (isHotkeyMatch(e, t.hotkey)) {
          e.preventDefault();
          toggleTunnelActive(t.id);
          return;
        }
      }

      // Escape: Close Settings (hardcoded fallback)
      if (e.key === "Escape") {
        setSettingsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [addTunnel, settingsOpen, isHotkeyMatch, toggleTunnelActive]);

  // Toggle mute — reads from tunnelsRef at execution time.
  const toggleTunnelMute = useCallback(
    (id: string) => {
      enqueue(id, async () => {
        const current = tunnelsRef.current.find((t) => t.id === id);
        if (!current?.active) return;
        const next: Tunnel = { ...current, muted: !current.muted };
        setTunnels((ts) => ts.map((t) => (t.id === id ? next : t)));
        await tauriAPI.setTunnelMuted(next.id, next.muted);
      });
    },
    [enqueue],
  );

  // Set master gain — live update, no tunnel restart needed.
  const setTunnelGain = useCallback((id: string, gain: number) => {
    setTunnels((ts) => ts.map((t) => (t.id === id ? { ...t, gain } : t)));
    const current = tunnelsRef.current.find((t) => t.id === id);
    if (current?.active) tauriAPI.setTunnelGain(id, gain);
  }, []);

  // Set per-input gain — live update, no tunnel restart needed.
  const setTunnelInputGain = useCallback(
    (id: string, inputIndex: number, gain: number) => {
      setTunnels((ts) =>
        ts.map((t) => {
          if (t.id !== id) return t;
          const inputs = t.inputs.map((inp, i) =>
            i === inputIndex ? { ...inp, gain } : inp,
          );
          return { ...t, inputs };
        }),
      );
      const current = tunnelsRef.current.find((t) => t.id === id);
      if (current?.active) tauriAPI.setTunnelInputGain(id, inputIndex, gain);
    },
    [],
  );

  // Set input priority — live update, no tunnel restart needed.
  const setTunnelInputPriority = useCallback(
    (id: string, inputIndex: number, priority: boolean) => {
      setTunnels((ts) =>
        ts.map((t) => {
          if (t.id !== id) return t;
          const inputs = t.inputs.map((inp, i) =>
            i === inputIndex ? { ...inp, priority } : inp,
          );
          return { ...t, inputs };
        }),
      );
      const current = tunnelsRef.current.find((t) => t.id === id);
      if (current?.active)
        tauriAPI.setTunnelInputPriority(id, inputIndex, priority);
    },
    [],
  );

  // Set ducking config — live update, no tunnel restart needed.
  const setTunnelDucking = useCallback(
    (
      id: string,
      duckingEnabled: boolean,
      duckingAmount: number,
      duckingRelease: number,
    ) => {
      setTunnels((ts) =>
        ts.map((t) =>
          t.id !== id
            ? t
            : { ...t, duckingEnabled, duckingAmount, duckingRelease },
        ),
      );
      const current = tunnelsRef.current.find((t) => t.id === id);
      if (current?.active) {
        tauriAPI.setTunnelDucking(id, {
          enabled: duckingEnabled,
          amount: duckingAmount,
          release: duckingRelease,
        });
      }
    },
    [],
  );

  // Rename — only touches the name, never restarts the stream.
  const renameTunnel = useCallback((id: string, name: string) => {
    setTunnels((ts) => ts.map((t) => (t.id === id ? { ...t, name } : t)));
  }, []);

  // Reorder via drag-and-drop.
  const reorderTunnels = useCallback((from: number, to: number) => {
    if (from === to) return;
    setTunnels((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  // Export current layout to a user-chosen JSON file.
  const exportLayout = useCallback(async () => {
    const snapshot = tunnelsRef.current.map((t) => ({
      ...t,
      active: false,
      muted: false,
    }));
    await tauriAPI.exportLayout(JSON.stringify(snapshot, null, 2));
  }, []);

  // Import layout from a JSON file — replaces all cables, stops active ones first.
  const importLayout = useCallback(async () => {
    const raw = await tauriAPI.importLayout();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      // Destroy all active tunnels before replacing state
      for (const t of tunnelsRef.current) {
        if (t.active) await tauriAPI.destroyTunnel(t.id);
      }
      const imported: Tunnel[] = parsed.map(
        (t: Record<string, unknown>, index) => {
          const inputs: TunnelInput[] =
            Array.isArray(t.inputs) && t.inputs.length > 0
              ? (
                  t.inputs as {
                    deviceId?: unknown;
                    appPid?: unknown;
                    gain?: unknown;
                    priority?: unknown;
                  }[]
                ).map((inp) => ({
                  deviceId:
                    typeof inp.deviceId === "number" ? inp.deviceId : null,
                  appPid: typeof inp.appPid === "number" ? inp.appPid : null,
                  gain: typeof inp.gain === "number" ? inp.gain : 1,
                  priority:
                    typeof inp.priority === "boolean" ? inp.priority : false,
                }))
              : [
                  {
                    deviceId:
                      typeof t.inputDeviceId === "number"
                        ? t.inputDeviceId
                        : null,
                    appPid: null,
                    gain: 1,
                    priority: false,
                  },
                ];
          return {
            id: crypto.randomUUID(),
            name: String(t.name ?? "Cable"),
            inputs,
            outputDeviceId:
              typeof t.outputDeviceId === "number" ? t.outputDeviceId : null,
            active: false,
            muted: false,
            channelCount:
              typeof t.channelCount === "number" ? t.channelCount : null,
            gain: typeof t.gain === "number" ? t.gain : 1,
            duckingEnabled:
              typeof t.duckingEnabled === "boolean" ? t.duckingEnabled : false,
            duckingAmount:
              typeof t.duckingAmount === "number" ? t.duckingAmount : 0.15,
            duckingRelease:
              typeof t.duckingRelease === "number" ? t.duckingRelease : 1000,
            hotkey:
              typeof t.hotkey === "string"
                ? t.hotkey
                : index < 9
                  ? `Ctrl+Alt+Numpad${index + 1}`
                  : null,
          };
        },
      );
      setTunnels(imported);
    } catch {
      // Silently ignore malformed files
    }
  }, []);

  const handleDownloadInstall = useCallback(async () => {
    setInstallState("downloading");
    setInstallPct(0);
    setInstallError("");
    setVbModalOpen(false);

    const unsub = tauriAPI.onVBAudioProgress((stage, pct) => {
      if (stage === "downloading") {
        setInstallState("downloading");
        setInstallPct(pct ?? 0);
      } else if (stage === "extracting") setInstallState("extracting");
      else if (stage === "launching") setInstallState("launching");
    });

    try {
      await tauriAPI.downloadAndInstallVBAudio();
      setInstallState("done");
    } catch (e: unknown) {
      setInstallError(e instanceof Error ? e.message : String(e));
      setInstallState("error");
    } finally {
      unsub();
    }
  }, []);

  // Fallback: open browser page if direct download fails
  const handleOpenPage = useCallback(async () => {
    await tauriAPI.installVBAudio();
    setVbModalOpen(false);
  }, []);

  const rescanDevices = useCallback(async () => {
    const [devs, installed, apps] = await Promise.all([
      tauriAPI.getDevices(),
      tauriAPI.checkVBAudioInstalled(),
      tauriAPI.getAudioApps(),
    ]);
    setDevices(devs);
    setAudioApps(apps);
    setVbInstalled(installed);
    if (installed) setVbToastDismissed(false);
  }, []);

  // Auto-rescan when the window regains focus so newly installed
  // VB-Audio devices appear without a manual rescan or restart
  useEffect(() => {
    window.addEventListener("focus", rescanDevices);
    return () => window.removeEventListener("focus", rescanDevices);
  }, [rescanDevices]);

  const activeCableCount = tunnels.filter((t) => t.active).length;

  const showToast =
    vbInstalled === false && !vbToastDismissed && installState === "idle";
  const showProgress = installState !== "idle" && installState !== "done";

  // Sync global shortcuts with the OS
  useEffect(() => {
    if (!loaded.current) return;

    let active = true;
    const syncShortcuts = async () => {
      console.log("Syncing global shortcuts...");
      try {
        await unregisterAll();
        if (!active) return;

        const toRegister: { key: string; action: () => void }[] = [];

        // Global settings hotkeys
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

        // Tunnel-specific hotkeys
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
            console.log(`Registering global shortcut: ${key}`);
            await register(key, (event) => {
              if (event.state === "Pressed") {
                console.log(`Global shortcut triggered: ${key}`);
                action();
              }
            });
          } catch (err) {
            console.error(`Failed to register global shortcut ${key}:`, err);
          }
        }
        console.log("Global shortcuts sync complete.");
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
    // Only re-sync if tunnel IDs or their hotkeys change
    JSON.stringify(tunnels.map((t) => ({ id: t.id, hotkey: t.hotkey }))),
    addTunnel,
    toggleTunnelActive,
  ]);

  const progressLabel: Record<InstallState, string> = {
    idle: "",
    downloading: `Downloading… ${installPct}%`,
    extracting: "Extracting…",
    launching: "Launching installer…",
    done: "",
    error: `Error: ${installError}`,
  };

  return (
    <div className="app-root">
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-mark">VIRTUAL CABLE</span>
        </div>

        <div className="header-meta">
          <div className="meta-stat">
            <span className="meta-val">
              {String(tunnels.length).padStart(2, "0")}
            </span>
            <span className="meta-label">cables</span>
          </div>
          <div className="meta-divider" />
          <div className="meta-stat">
            <span className={`meta-val ${activeCableCount > 0 ? "live" : ""}`}>
              {String(activeCableCount).padStart(2, "0")}
            </span>
            <span className="meta-label">live</span>
          </div>
          <div className="meta-divider" />
          {vbInstalled === true ? (
            <span className="meta-vb-ok">
              <CheckCircle2 size={13} strokeWidth={2.5} />
              VB-Audio
            </span>
          ) : (
            <button
              className="header-rescan-btn"
              onClick={rescanDevices}
              title="Re-scan audio devices"
            >
              <RefreshCw size={14} strokeWidth={2} />
            </button>
          )}
          <div className="meta-divider" />
          <button
            className="header-settings-btn"
            onClick={exportLayout}
            title="Export cable layout"
          >
            <Download size={14} strokeWidth={1.75} />
          </button>
          <button
            className="header-settings-btn"
            onClick={importLayout}
            title="Import cable layout"
          >
            <Upload size={14} strokeWidth={1.75} />
          </button>
          <div className="meta-divider" />
          <button
            className="header-settings-btn"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            <Settings size={15} strokeWidth={1.75} />
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="cables-container">
          <TunnelList
            tunnels={tunnels}
            devices={devices}
            audioApps={audioApps}
            onUpdate={updateTunnel}
            onToggleActive={toggleTunnelActive}
            onToggleMute={toggleTunnelMute}
            onSetGain={setTunnelGain}
            onSetInputGain={setTunnelInputGain}
            onSetInputPriority={setTunnelInputPriority}
            onSetDucking={setTunnelDucking}
            onRename={renameTunnel}
            onReorder={reorderTunnels}
            onDelete={deleteTunnel}
          />
        </div>
      </main>

      <button className="fab-new" onClick={addTunnel}>
        <Plus size={14} strokeWidth={2.5} />
        New Cable
      </button>

      {/* Idle toast — shown when VB-Audio missing and install not started */}
      {showToast && (
        <div className="vb-toast">
          <div className="vb-toast-content">
            <div className="vb-toast-row">
              <span className="vb-toast-icon">
                <Hexagon size={18} strokeWidth={1.5} />
              </span>
              <div className="vb-toast-text">
                <span className="vb-toast-title">VB-Audio not detected</span>
                <span className="vb-toast-sub">
                  Required for virtual devices visible to other apps.
                </span>
              </div>
            </div>
          </div>
          <div className="vb-toast-actions">
            <button
              className="vb-toast-install"
              onClick={() => setVbModalOpen(true)}
            >
              Install <ExternalLink size={12} strokeWidth={2} />
            </button>
            <button
              className="vb-toast-dismiss"
              onClick={() => setVbToastDismissed(true)}
            >
              <X size={14} strokeWidth={2} />
            </button>
          </div>
        </div>
      )}

      {/* Progress / error toast — shown while downloading/installing */}
      {showProgress && (
        <div
          className={`vb-toast${installState === "error" ? " is-error" : ""}`}
        >
          <div className="vb-toast-content">
            <div className="vb-toast-row">
              <span className="vb-toast-icon">
                {installState === "error" ? (
                  <AlertCircle size={18} strokeWidth={1.5} />
                ) : (
                  <Hexagon size={18} strokeWidth={1.5} />
                )}
              </span>
              <div className="vb-toast-text">
                <span className="vb-toast-title">
                  {installState === "error"
                    ? "Install failed"
                    : "Installing VB-Audio"}
                </span>
                <span className="vb-toast-sub">
                  {progressLabel[installState]}
                </span>
              </div>
            </div>
            {installState === "downloading" && (
              <div className="vb-toast-bar">
                <div
                  className="vb-toast-bar-fill"
                  style={{ width: `${installPct}%` }}
                />
              </div>
            )}
          </div>
          {installState === "error" && (
            <div className="vb-toast-actions">
              <button className="vb-toast-install" onClick={handleOpenPage}>
                Open page <ExternalLink size={12} strokeWidth={2} />
              </button>
              <button
                className="vb-toast-dismiss"
                onClick={() => {
                  setInstallState("idle");
                  setVbToastDismissed(false);
                }}
              >
                <X size={14} strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          tauriAPI.loadSettings().then(setSettings);
        }}
      />

      <VBInstallModal
        open={vbModalOpen}
        onInstall={handleDownloadInstall}
        onOpenPage={handleOpenPage}
        onDismiss={() => setVbModalOpen(false)}
      />
    </div>
  );
}
