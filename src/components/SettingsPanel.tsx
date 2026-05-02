import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
import packageJson from "../../package.json";
import type { AppSettings, BufferSize, UpdateState } from "../types";
import { tauriAPI } from "../tauriAPI";

interface Props {
  open: boolean;
  onClose: () => void;
}

const VERSION = packageJson.version;

const STATUS_LABEL: Record<UpdateState["status"], string> = {
  idle: "",
  checking: "Checking…",
  available: "Update available",
  "not-available": "Up to date",
  ready: "Ready to install",
  error: "Check failed",
};

const STATUS_CLASS: Record<UpdateState["status"], string> = {
  idle: "",
  checking: "update-status--checking",
  available: "update-status--available",
  "not-available": "update-status--ok",
  ready: "update-status--ready",
  error: "update-status--error",
};

const BUFFER_OPTIONS: { value: BufferSize; label: string; sub: string }[] = [
  { value: 256, label: "Low", sub: "~5 ms" },
  { value: 512, label: "Medium", sub: "~10 ms" },
  { value: 1024, label: "High", sub: "~21 ms" },
];

export default function SettingsPanel({ open, onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings>({
    autoUpdate: false,
    minimizeToTray: false,
    launchOnStartup: false,
    experimentalFeatures: false,
    expLatency: false,
    bufferSize: 512,
  });
  const [updateState, setUpdateState] = useState<UpdateState>({
    status: "idle",
  });

  // Load settings and current update state on open
  useEffect(() => {
    if (!open) return;
    tauriAPI.loadSettings().then((s) => {
      setSettings(s);
      // Only check update state if autoUpdate is enabled
      if (s.autoUpdate) {
        tauriAPI.getUpdateState().then(setUpdateState);
      }
    });
  }, [open]);

  // Subscribe to live update status pushes from main process
  useEffect(() => {
    const unsub = tauriAPI.onUpdateStatus(setUpdateState);
    return unsub;
  }, []);

  const setSetting = useCallback(
    async (patch: Partial<typeof settings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);

      // Handle Windows startup registry separately
      if ("launchOnStartup" in patch) {
        await tauriAPI.setLaunchOnStartup(patch.launchOnStartup!);
      }

      await tauriAPI.saveSettings(next);
    },
    [settings],
  );

  const checkNow = useCallback(async () => {
    setUpdateState({ status: "checking" });
    try {
      const result = await tauriAPI.checkForUpdates();
      setUpdateState(result);

      // Auto-dismiss "up to date" message after 3 seconds
      if (result.status === "not-available") {
        setTimeout(() => setUpdateState({ status: "idle" }), 3000);
      }
    } catch {
      setUpdateState({
        status: "error",
      });
      setTimeout(() => setUpdateState({ status: "idle" }), 3000);
    }
  }, []);

  const downloadUpdate = useCallback(async () => {
    if (updateState.status === "available") {
      setUpdateState({ status: "checking" }); // Use "checking" to show downloading progress
      try {
        await tauriAPI.installUpdate();
      } catch {
        setUpdateState({ status: "error", error: "Failed to download update" });
        setTimeout(() => setUpdateState({ status: "idle" }), 3000);
      }
    }
  }, [updateState.status]);

  const installNow = useCallback(() => {
    tauriAPI.installUpdate();
  }, []);

  const isChecking = updateState.status === "checking";

  const statusText = STATUS_LABEL[updateState.status];

  return (
    <>
      {/* Backdrop */}
      <div
        className={`settings-backdrop${open ? " is-open" : ""}`}
        onClick={onClose}
      />

      {/* Panel */}
      <aside className={`settings-panel${open ? " is-open" : ""}`}>
        <div className="settings-header">
          <span className="settings-title">Settings</span>
          <button className="settings-close" onClick={onClose}>
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        <div className="settings-body">
          {/* ── About ── */}
          <section className="settings-section">
            <span className="settings-section-title">About</span>

            <div className="about-brand">VIRTUAL CABLE</div>
            <div className="about-sub">Patchbay for Windows</div>

            <div className="settings-rows">
              <div className="settings-row">
                <span className="settings-row-label">Version</span>
                <span className="settings-row-val">{VERSION}</span>
              </div>
              <div className="settings-row">
                <span className="settings-row-label">License</span>
                <span className="settings-row-val">MIT · KingIronMan2011</span>
              </div>
              <div className="settings-row">
                <span className="settings-row-label">Built with</span>
                <span className="settings-row-val">
                  Tauri · React · PortAudio
                </span>
              </div>
            </div>
          </section>

          {/* ── Behaviour ── */}
          <section className="settings-section">
            <span className="settings-section-title">Behaviour</span>

            <div className="settings-toggle-row">
              <div className="settings-toggle-text">
                <span className="settings-toggle-label">Minimize to tray</span>
                <span className="settings-toggle-sub">
                  Closing the window keeps cables running in the background
                </span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.minimizeToTray}
                  onChange={(e) =>
                    setSetting({ minimizeToTray: e.target.checked })
                  }
                />
                <span className="toggle-slider" />
              </label>
            </div>

            <div className="settings-toggle-row">
              <div className="settings-toggle-text">
                <span className="settings-toggle-label">
                  Launch on Windows startup
                </span>
                <span className="settings-toggle-sub">
                  Automatically start the app when your computer boots
                </span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.launchOnStartup}
                  onChange={(e) =>
                    setSetting({ launchOnStartup: e.target.checked })
                  }
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </section>

          {/* ── Experimental ── */}
          <section className="settings-section">
            <span className="settings-section-title">Experimental</span>

            <div className="settings-toggle-row">
              <div className="settings-toggle-text">
                <span className="settings-toggle-label">
                  Experimental features
                </span>
                <span className="settings-toggle-sub">
                  Enable in-progress features. May cause instability.
                </span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.experimentalFeatures}
                  onChange={(e) =>
                    setSetting({ experimentalFeatures: e.target.checked })
                  }
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {settings.experimentalFeatures && (
              <div className="experimental-features">
                {/* ── Custom latency ── */}
                <div className="exp-feature">
                  <div className="settings-toggle-row exp-feature-toggle">
                    <div className="settings-toggle-text">
                      <span className="settings-toggle-label">
                        Custom latency
                      </span>
                      <span className="settings-toggle-sub">
                        Override PortAudio buffer size. Active cables restart
                        when changed.
                      </span>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={settings.expLatency}
                        onChange={(e) =>
                          setSetting({ expLatency: e.target.checked })
                        }
                      />
                      <span className="toggle-slider" />
                    </label>
                  </div>
                  {settings.expLatency && (
                    <div className="latency-picker">
                      {BUFFER_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          className={`latency-btn${settings.bufferSize === opt.value ? " is-active" : ""}`}
                          onClick={() => setSetting({ bufferSize: opt.value })}
                        >
                          <span className="latency-btn-label">{opt.label}</span>
                          <span className="latency-btn-sub">{opt.sub}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── Updates ── */}
          <section className="settings-section">
            <span className="settings-section-title">Updates</span>

            <div className="settings-rows">
              <div className="settings-row">
                <span className="settings-row-label">Current</span>
                <span className="settings-row-val">v{VERSION}</span>
              </div>
              {updateState.status === "ready" && updateState.version && (
                <div className="settings-row">
                  <span className="settings-row-label">Available</span>
                  <span className="settings-row-val update-version">
                    {updateState.version}
                  </span>
                </div>
              )}
            </div>

            {/* Status chip */}
            {statusText && (
              <div
                className={`update-status ${STATUS_CLASS[updateState.status]}`}
              >
                {statusText}
              </div>
            )}

            {/* Error message */}
            {updateState.status === "error" && updateState.error && (
              <p className="update-error-msg">{updateState.error}</p>
            )}

            <div className="settings-actions">
              {updateState.status === "ready" ? (
                <button className="btn-primary" onClick={installNow}>
                  Restart &amp; Install
                </button>
              ) : updateState.status === "available" ? (
                <button
                  className="btn-primary"
                  onClick={downloadUpdate}
                  disabled={isChecking}
                >
                  Download Update
                </button>
              ) : (
                <button
                  className="btn-primary"
                  onClick={checkNow}
                  disabled={isChecking}
                >
                  {isChecking ? "Checking…" : "Check for Updates"}
                </button>
              )}
            </div>

            {/* Auto-update toggle */}
            <div className="settings-toggle-row">
              <div className="settings-toggle-text">
                <span className="settings-toggle-label">Auto-update</span>
                <span className="settings-toggle-sub">
                  Check for updates automatically on startup
                </span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings.autoUpdate}
                  onChange={(e) => setSetting({ autoUpdate: e.target.checked })}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
