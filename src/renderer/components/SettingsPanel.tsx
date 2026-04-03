import { useEffect, useState, useCallback } from "react";
import packageJson from "../../../package.json";
import type { UpdateState } from "../../updater/updater";
import type { AppSettings } from "../../store/settingsStore";

interface Props {
  open: boolean;
  onClose: () => void;
}

const VERSION = packageJson.version;

const STATUS_LABEL: Record<UpdateState["status"], string> = {
  idle: "",
  checking: "Checking…",
  available: "Downloading update…",
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

export default function SettingsPanel({ open, onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings>({ autoUpdate: false });
  const [updateState, setUpdateState] = useState<UpdateState>({
    status: "idle",
  });

  // Load settings and current update state on open
  useEffect(() => {
    if (!open) return;
    window.electronAPI.loadSettings().then(setSettings);
    window.electronAPI.getUpdateState().then(setUpdateState);
  }, [open]);

  // Subscribe to live update status pushes from main process
  useEffect(() => {
    const unsub = window.electronAPI.onUpdateStatus(setUpdateState);
    return unsub;
  }, []);

  const setAutoUpdate = useCallback(
    async (enabled: boolean) => {
      const next = { ...settings, autoUpdate: enabled };
      setSettings(next);
      await window.electronAPI.saveSettings(next);
    },
    [settings],
  );

  const checkNow = useCallback(() => {
    window.electronAPI.checkForUpdates();
  }, []);

  const installNow = useCallback(() => {
    window.electronAPI.installUpdate();
  }, []);

  const isChecking =
    updateState.status === "checking" || updateState.status === "available";

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
            ✕
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
                  Electron · React · PortAudio
                </span>
              </div>
            </div>
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
                  onChange={(e) => setAutoUpdate(e.target.checked)}
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
