import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { SlidersHorizontal, X } from "lucide-react";
import packageJson from "../../package.json";
import type { AppSettings, UpdateState } from "../types";
import { tauriAPI } from "../tauriAPI";
import HotkeyInput from "./HotkeyInput";

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

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }

  return fallback;
}

export default function SettingsPanel({ open, onClose }: Props) {
  const [settings, setSettings] = useState<AppSettings>({
    autoUpdate: false,
    minimizeToTray: false,
    launchOnStartup: false,
    hotkeys: {
      addCable: "Ctrl+Alt+N",
      toggleSettings: "Ctrl+Alt+,",
    },
  });
  const [updateState, setUpdateState] = useState<UpdateState>({
    status: "idle",
  });

  // Load settings and current update state on open
  useEffect(() => {
    if (!open) return;
    tauriAPI
      .loadSettings()
      .then((s) => {
        setSettings((prev) => ({
          ...prev,
          ...s,
          hotkeys: {
            ...prev.hotkeys,
            ...(s.hotkeys || {}),
          },
        }));
        if (s.autoUpdate) {
          void tauriAPI.getUpdateState().then(setUpdateState);
        }
      })
      .catch((error) => {
        console.error("Failed to load settings:", error);
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
    } catch (error) {
      console.error("Update check failed:", error);
      setUpdateState({
        status: "error",
        error: getErrorMessage(error, "Failed to check for updates"),
      });
      setTimeout(() => setUpdateState({ status: "idle" }), 3000);
    }
  }, []);

  const downloadUpdate = useCallback(async () => {
    if (updateState.status === "available") {
      setUpdateState({ status: "checking" }); // Use "checking" to show downloading progress
      try {
        await tauriAPI.installUpdate();
      } catch (error) {
        console.error("Update download/install failed:", error);
        setUpdateState({
          status: "error",
          error: getErrorMessage(error, "Failed to download update"),
        });
        setTimeout(() => setUpdateState({ status: "idle" }), 3000);
      }
    }
  }, [updateState.status]);

  const installNow = useCallback(() => {
    tauriAPI.installUpdate();
  }, []);

  const isChecking = updateState.status === "checking";

  const statusText = STATUS_LABEL[updateState.status];

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className={`settings-backdrop${open ? "is-open" : ""}`}
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className={`settings-panel${open ? "is-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        <div className="settings-header">
          <div className="settings-heading">
            <span className="settings-heading-icon">
              <SlidersHorizontal size={16} strokeWidth={2.1} />
            </span>
            <div>
              <span className="settings-title">Settings</span>
              <span className="settings-subtitle">Application preferences</span>
            </div>
          </div>
          <button className="settings-close" onClick={onClose}>
            <X size={15} strokeWidth={2} />
          </button>
        </div>

        <div className="settings-body">
          {/* ── About ── */}
          <section className="settings-section">
            <span className="settings-section-title">About</span>

            <div className="about-brand">VIRTUAL CABLE</div>

            <div className="settings-rows">
              <div className="settings-row">
                <span className="settings-row-label">Version</span>
                <span className="settings-row-val">{VERSION}</span>
              </div>
              <div className="settings-row">
                <span className="settings-row-label">Made by</span>
                <span className="settings-row-val">KingIronMan2011</span>
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

          {/* ── Shortcuts ── */}
          <section className="settings-section">
            <span className="settings-section-title">Shortcuts</span>
            <div className="settings-rows">
              <div className="settings-row">
                <span className="settings-row-label">Add new cable</span>
                <HotkeyInput
                  value={settings.hotkeys?.addCable || null}
                  onChange={(val) =>
                    setSetting({
                      hotkeys: {
                        ...settings.hotkeys,
                        addCable: val || "Ctrl+Alt+N",
                      },
                    })
                  }
                />
              </div>
              <div className="settings-row">
                <span className="settings-row-label">Toggle settings</span>
                <HotkeyInput
                  value={settings.hotkeys?.toggleSettings || null}
                  onChange={(val) =>
                    setSetting({
                      hotkeys: {
                        ...settings.hotkeys,
                        toggleSettings: val || "Ctrl+Alt+,",
                      },
                    })
                  }
                />
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
    </>,
    document.body,
  );
}
