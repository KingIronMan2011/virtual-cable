import { useEffect, useState, useCallback, useRef } from "react";
import type { AudioDevice, Tunnel, InstallState, AppSettings } from "../types";
import TunnelList from "./components/TunnelList";
import VBInstallModal from "./components/VBInstallModal";
import SettingsPanel from "./components/SettingsPanel";

const SETTINGS_DEFAULTS: AppSettings = {
  autoUpdate: false,
  minimizeToTray: false,
  experimentalFeatures: false,
  expLatency: false,
  bufferSize: 512,
  expSampleRate: false,
};

export default function App() {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
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

  useEffect(() => {
    Promise.all([
      window.electronAPI.getDevices(),
      window.electronAPI.loadTunnels(),
      window.electronAPI.checkVBAudioInstalled(),
      window.electronAPI.loadSettings(),
    ]).then(([devs, saved, installed, s]) => {
      setDevices(devs);
      setTunnels(saved);
      setVbInstalled(installed);
      setSettings(s);
      loaded.current = true;
    });
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    window.electronAPI.saveTunnels(tunnels);
  }, [tunnels]);

  const addTunnel = useCallback(() => {
    setTunnels((prev) => {
      const n = prev.length + 1;
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: `Cable ${String(n).padStart(2, "0")}`,
          inputDeviceId: null,
          outputDeviceId: null,
          active: false,
          muted: false,
        },
      ];
    });
  }, []);

  const deleteTunnel = useCallback(async (id: string) => {
    await window.electronAPI.destroyTunnel(id);
    setTunnels((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const updateTunnel = useCallback(async (updated: Tunnel) => {
    let prev: Tunnel | undefined;
    setTunnels((ts) => {
      prev = ts.find((t) => t.id === updated.id);
      return ts.map((t) => (t.id === updated.id ? updated : t));
    });

    if (
      updated.active &&
      updated.inputDeviceId !== null &&
      updated.outputDeviceId !== null
    ) {
      // Only (re)create the stream when going from inactive → active
      if (!prev?.active) {
        await window.electronAPI.createTunnel(
          updated.id,
          updated.inputDeviceId,
          updated.outputDeviceId,
        );
      }
      // Apply mute state whenever the tunnel is active (handles mute toggle on live tunnel)
      await window.electronAPI.setTunnelMuted(updated.id, updated.muted);
    } else {
      await window.electronAPI.destroyTunnel(updated.id);
    }
  }, []);

  const handleDownloadInstall = useCallback(async () => {
    setInstallState("downloading");
    setInstallPct(0);
    setInstallError("");
    setVbModalOpen(false);

    const unsub = window.electronAPI.onVBAudioProgress((stage, pct) => {
      if (stage === "downloading") {
        setInstallState("downloading");
        setInstallPct(pct ?? 0);
      } else if (stage === "extracting") setInstallState("extracting");
      else if (stage === "launching") setInstallState("launching");
    });

    try {
      await window.electronAPI.downloadAndInstallVBAudio();
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
    await window.electronAPI.installVBAudio();
    setVbModalOpen(false);
  }, []);

  const rescanDevices = useCallback(async () => {
    const [devs, installed] = await Promise.all([
      window.electronAPI.getDevices(),
      window.electronAPI.checkVBAudioInstalled(),
    ]);
    setDevices(devs);
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
          <span className="brand-ver">patchbay v1</span>
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
            <span className="meta-vb-ok">VB-Audio ✓</span>
          ) : (
            <button
              className="header-rescan-btn"
              onClick={rescanDevices}
              title="Re-scan audio devices"
            >
              ↺
            </button>
          )}
          <div className="meta-divider" />
          <button
            className="header-settings-btn"
            onClick={() => setSettingsOpen(true)}
            title="Settings"
          >
            ⚙
          </button>
        </div>
      </header>

      <main className="app-main">
        <div className="cables-container">
          <TunnelList
            tunnels={tunnels}
            devices={devices}
            onUpdate={updateTunnel}
            onDelete={deleteTunnel}
            expSampleRate={
              settings.experimentalFeatures && settings.expSampleRate
            }
          />
        </div>
      </main>

      <button className="fab-new" onClick={addTunnel}>
        <span style={{ fontSize: "0.75rem", lineHeight: 1 }}>+</span>
        New Cable
      </button>

      {/* Idle toast — shown when VB-Audio missing and install not started */}
      {showToast && (
        <div className="vb-toast">
          <div className="vb-toast-content">
            <div className="vb-toast-row">
              <span className="vb-toast-icon">⬡</span>
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
              Install ↗
            </button>
            <button
              className="vb-toast-dismiss"
              onClick={() => setVbToastDismissed(true)}
            >
              ✕
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
                {installState === "error" ? "✕" : "⬡"}
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
                Open page
              </button>
              <button
                className="vb-toast-dismiss"
                onClick={() => {
                  setInstallState("idle");
                  setVbToastDismissed(false);
                }}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      <SettingsPanel
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          window.electronAPI.loadSettings().then(setSettings);
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
