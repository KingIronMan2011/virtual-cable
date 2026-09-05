import { useEffect, useState, useCallback } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { PhysicalPosition, PhysicalSize } from "@tauri-apps/api/dpi";
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
import { useTunnels } from "./hooks/useTunnels";
import { useGlobalShortcuts } from "./hooks/useGlobalShortcuts";
import { useWindowState } from "./hooks/useWindowState";

const SETTINGS_DEFAULTS: AppSettings = {
  autoUpdate: false,
  minimizeToTray: false,
  launchOnStartup: false,
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
  const [settings, setSettings] = useState<AppSettings>(SETTINGS_DEFAULTS);
  const [vbInstalled, setVbInstalled] = useState<boolean | null>(null);
  const [vbModalOpen, setVbModalOpen] = useState(false);
  const [vbToastDismissed, setVbToastDismissed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [installState, setInstallState] = useState<InstallState>("idle");
  const [installPct, setInstallPct] = useState(0);
  const [installError, setInstallError] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const {
    tunnels,
    setTunnels,
    tunnelsRef,
    togglingIds,
    addTunnel,
    deleteTunnel,
    updateTunnel,
    toggleTunnelActive,
    toggleTunnelMute,
    setTunnelGain,
    setTunnelInputGain,
    setTunnelInputPriority,
    setTunnelDucking,
    renameTunnel,
    reorderTunnels,
  } = useTunnels(isLoaded);

  useWindowState(isLoaded);

  useGlobalShortcuts(
    isLoaded,
    settings,
    tunnels,
    addTunnel,
    setSettingsOpen,
    toggleTunnelActive,
  );

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

      const appWindow = WebviewWindow.getCurrent();
      if (windowState) {
        // Basic sanity check: if coordinates are extreme, center instead.
        // Windows 'minimized' coordinates can be around -32000.
        const isOffscreen =
          Math.abs(windowState.x) > 10000 ||
          Math.abs(windowState.y) > 10000 ||
          windowState.width < 100 ||
          windowState.height < 100;

        if (isOffscreen) {
          appWindow.center();
        } else {
          appWindow.setPosition(
            new PhysicalPosition(windowState.x, windowState.y),
          );
        }
        appWindow.setSize(
          new PhysicalSize(
            Math.max(windowState.width, 600),
            Math.max(windowState.height, 400),
          ),
        );
      } else {
        appWindow.center();
      }

      setIsLoaded(true);
    });
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

  // Export current layout to a user-chosen JSON file.
  const exportLayout = useCallback(async () => {
    const snapshot = tunnelsRef.current.map((t) => ({
      ...t,
      active: false,
      muted: false,
    }));
    await tauriAPI.exportLayout(JSON.stringify(snapshot, null, 2));
  }, [tunnelsRef]);

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
  }, [setTunnels, tunnelsRef]);

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

  useEffect(() => {
    window.addEventListener("focus", rescanDevices);
    return () => window.removeEventListener("focus", rescanDevices);
  }, [rescanDevices]);

  const activeCableCount = tunnels.filter((t) => t.active).length;

  const showToast =
    vbInstalled === false && !vbToastDismissed && installState === "idle";
  const showProgress = installState !== "idle" && installState !== "done";

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
            togglingIds={togglingIds}
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
          className={`vb-toast${installState === "error" ? "is-error" : ""}`}
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
