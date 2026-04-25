import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
import packageJson from "../../../package.json";
import { tauriAPI } from "../tauriAPI";
const VERSION = packageJson.version;
const STATUS_LABEL = {
    idle: "",
    checking: "Checking…",
    available: "Downloading update…",
    "not-available": "Up to date",
    ready: "Ready to install",
    error: "Check failed",
};
const STATUS_CLASS = {
    idle: "",
    checking: "update-status--checking",
    available: "update-status--available",
    "not-available": "update-status--ok",
    ready: "update-status--ready",
    error: "update-status--error",
};
const BUFFER_OPTIONS = [
    { value: 256, label: "Low", sub: "~5 ms" },
    { value: 512, label: "Medium", sub: "~10 ms" },
    { value: 1024, label: "High", sub: "~21 ms" },
];
export default function SettingsPanel({ open, onClose }) {
    const [settings, setSettings] = useState({
        autoUpdate: false,
        minimizeToTray: false,
        experimentalFeatures: false,
        expLatency: false,
        bufferSize: 512,
        expSampleRate: false,
    });
    const [updateState, setUpdateState] = useState({
        status: "idle",
    });
    // Load settings and current update state on open
    useEffect(() => {
        if (!open)
            return;
        tauriAPI.loadSettings().then(setSettings);
        tauriAPI.getUpdateState().then(setUpdateState);
    }, [open]);
    // Subscribe to live update status pushes from main process
    useEffect(() => {
        const unsub = tauriAPI.onUpdateStatus(setUpdateState);
        return unsub;
    }, []);
    const setSetting = useCallback(async (patch) => {
        const next = { ...settings, ...patch };
        setSettings(next);
        await tauriAPI.saveSettings(next);
    }, [settings]);
    const checkNow = useCallback(() => {
        tauriAPI.checkForUpdates();
    }, []);
    const installNow = useCallback(() => {
        tauriAPI.installUpdate();
    }, []);
    const isChecking = updateState.status === "checking" || updateState.status === "available";
    const statusText = STATUS_LABEL[updateState.status];
    return (_jsxs(_Fragment, { children: [_jsx("div", { className: `settings-backdrop${open ? " is-open" : ""}`, onClick: onClose }), _jsxs("aside", { className: `settings-panel${open ? " is-open" : ""}`, children: [_jsxs("div", { className: "settings-header", children: [_jsx("span", { className: "settings-title", children: "Settings" }), _jsx("button", { className: "settings-close", onClick: onClose, children: _jsx(X, { size: 15, strokeWidth: 2 }) })] }), _jsxs("div", { className: "settings-body", children: [_jsxs("section", { className: "settings-section", children: [_jsx("span", { className: "settings-section-title", children: "About" }), _jsx("div", { className: "about-brand", children: "VIRTUAL CABLE" }), _jsx("div", { className: "about-sub", children: "Patchbay for Windows" }), _jsxs("div", { className: "settings-rows", children: [_jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row-label", children: "Version" }), _jsx("span", { className: "settings-row-val", children: VERSION })] }), _jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row-label", children: "License" }), _jsx("span", { className: "settings-row-val", children: "MIT \u00B7 KingIronMan2011" })] }), _jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row-label", children: "Built with" }), _jsx("span", { className: "settings-row-val", children: "Tauri \u00B7 React \u00B7 PortAudio" })] })] })] }), _jsxs("section", { className: "settings-section", children: [_jsx("span", { className: "settings-section-title", children: "Behaviour" }), _jsxs("div", { className: "settings-toggle-row", children: [_jsxs("div", { className: "settings-toggle-text", children: [_jsx("span", { className: "settings-toggle-label", children: "Minimize to tray" }), _jsx("span", { className: "settings-toggle-sub", children: "Closing the window keeps cables running in the background" })] }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", checked: settings.minimizeToTray, onChange: (e) => setSetting({ minimizeToTray: e.target.checked }) }), _jsx("span", { className: "toggle-slider" })] })] })] }), _jsxs("section", { className: "settings-section", children: [_jsx("span", { className: "settings-section-title", children: "Experimental" }), _jsxs("div", { className: "settings-toggle-row", children: [_jsxs("div", { className: "settings-toggle-text", children: [_jsx("span", { className: "settings-toggle-label", children: "Experimental features" }), _jsx("span", { className: "settings-toggle-sub", children: "Enable in-progress features. May cause instability." })] }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", checked: settings.experimentalFeatures, onChange: (e) => setSetting({ experimentalFeatures: e.target.checked }) }), _jsx("span", { className: "toggle-slider" })] })] }), settings.experimentalFeatures && (_jsxs("div", { className: "experimental-features", children: [_jsxs("div", { className: "exp-feature", children: [_jsxs("div", { className: "settings-toggle-row exp-feature-toggle", children: [_jsxs("div", { className: "settings-toggle-text", children: [_jsx("span", { className: "settings-toggle-label", children: "Custom latency" }), _jsx("span", { className: "settings-toggle-sub", children: "Override PortAudio buffer size. Active cables restart when changed." })] }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", checked: settings.expLatency, onChange: (e) => setSetting({ expLatency: e.target.checked }) }), _jsx("span", { className: "toggle-slider" })] })] }), settings.expLatency && (_jsx("div", { className: "latency-picker", children: BUFFER_OPTIONS.map((opt) => (_jsxs("button", { className: `latency-btn${settings.bufferSize === opt.value ? " is-active" : ""}`, onClick: () => setSetting({ bufferSize: opt.value }), children: [_jsx("span", { className: "latency-btn-label", children: opt.label }), _jsx("span", { className: "latency-btn-sub", children: opt.sub })] }, opt.value))) }))] }), _jsx("div", { className: "exp-feature", children: _jsxs("div", { className: "settings-toggle-row exp-feature-toggle", children: [_jsxs("div", { className: "settings-toggle-text", children: [_jsx("span", { className: "settings-toggle-label", children: "Sample rate display" }), _jsx("span", { className: "settings-toggle-sub", children: "Show the negotiated sample rate on each active cable." })] }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", checked: settings.expSampleRate, onChange: (e) => setSetting({ expSampleRate: e.target.checked }) }), _jsx("span", { className: "toggle-slider" })] })] }) })] }))] }), _jsxs("section", { className: "settings-section", children: [_jsx("span", { className: "settings-section-title", children: "Updates" }), _jsxs("div", { className: "settings-rows", children: [_jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row-label", children: "Current" }), _jsxs("span", { className: "settings-row-val", children: ["v", VERSION] })] }), updateState.status === "ready" && updateState.version && (_jsxs("div", { className: "settings-row", children: [_jsx("span", { className: "settings-row-label", children: "Available" }), _jsx("span", { className: "settings-row-val update-version", children: updateState.version })] }))] }), statusText && (_jsx("div", { className: `update-status ${STATUS_CLASS[updateState.status]}`, children: statusText })), updateState.status === "error" && updateState.error && (_jsx("p", { className: "update-error-msg", children: updateState.error })), _jsx("div", { className: "settings-actions", children: updateState.status === "ready" ? (_jsx("button", { className: "btn-primary", onClick: installNow, children: "Restart & Install" })) : (_jsx("button", { className: "btn-primary", onClick: checkNow, disabled: isChecking, children: isChecking ? "Checking…" : "Check for Updates" })) }), _jsxs("div", { className: "settings-toggle-row", children: [_jsxs("div", { className: "settings-toggle-text", children: [_jsx("span", { className: "settings-toggle-label", children: "Auto-update" }), _jsx("span", { className: "settings-toggle-sub", children: "Check for updates automatically on startup" })] }), _jsxs("label", { className: "toggle-switch", children: [_jsx("input", { type: "checkbox", checked: settings.autoUpdate, onChange: (e) => setSetting({ autoUpdate: e.target.checked }) }), _jsx("span", { className: "toggle-slider" })] })] })] })] })] })] }));
}
//# sourceMappingURL=SettingsPanel.js.map