import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback, useRef } from "react";
import { AlertCircle, CheckCircle2, Download, ExternalLink, Hexagon, Plus, RefreshCw, Settings, Upload, X, } from "lucide-react";
import TunnelList from "./components/TunnelList";
import VBInstallModal from "./components/VBInstallModal";
import SettingsPanel from "./components/SettingsPanel";
import { tauriAPI } from "./tauriAPI";
const SETTINGS_DEFAULTS = {
    autoUpdate: false,
    minimizeToTray: false,
    experimentalFeatures: false,
    expLatency: false,
    bufferSize: 512,
    expSampleRate: false,
};
export default function App() {
    const [devices, setDevices] = useState([]);
    const [audioApps, setAudioApps] = useState([]);
    const [tunnels, setTunnels] = useState([]);
    const [settings, setSettings] = useState(SETTINGS_DEFAULTS);
    const [vbInstalled, setVbInstalled] = useState(null);
    const [vbModalOpen, setVbModalOpen] = useState(false);
    const [vbToastDismissed, setVbToastDismissed] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [installState, setInstallState] = useState("idle");
    const [installPct, setInstallPct] = useState(0);
    const [installError, setInstallError] = useState("");
    const loaded = useRef(false);
    // Per-tunnel serial queue — each call chains off the previous so IPC messages
    // for the same tunnel always arrive in the order the user triggered them.
    const updateQueues = useRef(new Map());
    // Mirror of `tunnels` state, updated synchronously on every render.
    // Queue operations read from this ref at execution time (after all prior async
    // IPC calls resolve and React has re-rendered), so they always see fresh state.
    const tunnelsRef = useRef([]);
    tunnelsRef.current = tunnels;
    useEffect(() => {
        Promise.all([
            tauriAPI.getDevices(),
            tauriAPI.loadTunnels(),
            tauriAPI.checkVBAudioInstalled(),
            tauriAPI.loadSettings(),
            tauriAPI.getAudioApps(),
        ]).then(([devs, saved, installed, s, apps]) => {
            setDevices(devs);
            setAudioApps(apps);
            setTunnels(saved);
            setVbInstalled(installed);
            setSettings(s);
            loaded.current = true;
        });
    }, []);
    useEffect(() => {
        if (!loaded.current)
            return;
        tauriAPI.saveTunnels(tunnels);
    }, [tunnels]);
    // Poll for newly started audio apps every 3 s so the user doesn't need to restart.
    useEffect(() => {
        const id = setInterval(async () => {
            const apps = await tauriAPI.getAudioApps();
            setAudioApps((prev) => {
                if (prev.length === apps.length &&
                    prev.every((p, i) => p.pid === apps[i].pid))
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
                },
            ];
        });
    }, []);
    const deleteTunnel = useCallback(async (id) => {
        await tauriAPI.destroyTunnel(id);
        setTunnels((prev) => prev.filter((t) => t.id !== id));
        updateQueues.current.delete(id);
    }, []);
    // Enqueue an async operation for a tunnel onto its serial queue.
    // One failure swallows so it doesn't stall subsequent operations.
    const enqueue = useCallback((id, op) => {
        const tail = (updateQueues.current.get(id) ?? Promise.resolve()).then(op);
        updateQueues.current.set(id, tail.catch(console.error));
    }, []);
    // Device-change: always deactivates the tunnel, no IPC needed beyond destroy.
    const updateTunnel = useCallback((updated) => {
        enqueue(updated.id, async () => {
            setTunnels((ts) => ts.map((t) => (t.id === updated.id ? updated : t)));
            await tauriAPI.destroyTunnel(updated.id);
        });
    }, [enqueue]);
    // Toggle active — reads from tunnelsRef at execution time so it always sees
    // the state committed by all previously-resolved queue operations.
    const toggleTunnelActive = useCallback((id) => {
        enqueue(id, async () => {
            const current = tunnelsRef.current.find((t) => t.id === id);
            if (!current)
                return;
            const next = {
                ...current,
                active: !current.active,
                // clear mute when going offline so it doesn't persist into next session
                muted: current.active ? false : current.muted,
            };
            setTunnels((ts) => ts.map((t) => (t.id === id ? next : t)));
            // An input is "ready" if it has either a device or an app selected.
            const readyInputs = next.inputs.filter((inp) => inp.deviceId !== null || inp.appPid !== null);
            if (next.active &&
                readyInputs.length > 0 &&
                next.outputDeviceId !== null) {
                await tauriAPI.createTunnel(next.id, readyInputs.map((inp) => ({
                    deviceId: inp.deviceId ?? 0,
                    appPid: inp.appPid ?? undefined,
                    gain: inp.gain,
                    priority: inp.priority,
                })), next.outputDeviceId, next.channelCount, {
                    enabled: next.duckingEnabled,
                    amount: next.duckingAmount,
                    release: next.duckingRelease,
                });
                await tauriAPI.setTunnelMuted(next.id, next.muted);
            }
            else {
                await tauriAPI.destroyTunnel(next.id);
            }
        });
    }, [enqueue]);
    // Toggle mute — reads from tunnelsRef at execution time.
    const toggleTunnelMute = useCallback((id) => {
        enqueue(id, async () => {
            const current = tunnelsRef.current.find((t) => t.id === id);
            if (!current?.active)
                return;
            const next = { ...current, muted: !current.muted };
            setTunnels((ts) => ts.map((t) => (t.id === id ? next : t)));
            await tauriAPI.setTunnelMuted(next.id, next.muted);
        });
    }, [enqueue]);
    // Set master gain — live update, no tunnel restart needed.
    const setTunnelGain = useCallback((id, gain) => {
        setTunnels((ts) => ts.map((t) => (t.id === id ? { ...t, gain } : t)));
        const current = tunnelsRef.current.find((t) => t.id === id);
        if (current?.active)
            tauriAPI.setTunnelGain(id, gain);
    }, []);
    // Set per-input gain — live update, no tunnel restart needed.
    const setTunnelInputGain = useCallback((id, inputIndex, gain) => {
        setTunnels((ts) => ts.map((t) => {
            if (t.id !== id)
                return t;
            const inputs = t.inputs.map((inp, i) => i === inputIndex ? { ...inp, gain } : inp);
            return { ...t, inputs };
        }));
        const current = tunnelsRef.current.find((t) => t.id === id);
        if (current?.active)
            tauriAPI.setTunnelInputGain(id, inputIndex, gain);
    }, []);
    // Set input priority — live update, no tunnel restart needed.
    const setTunnelInputPriority = useCallback((id, inputIndex, priority) => {
        setTunnels((ts) => ts.map((t) => {
            if (t.id !== id)
                return t;
            const inputs = t.inputs.map((inp, i) => i === inputIndex ? { ...inp, priority } : inp);
            return { ...t, inputs };
        }));
        const current = tunnelsRef.current.find((t) => t.id === id);
        if (current?.active)
            tauriAPI.setTunnelInputPriority(id, inputIndex, priority);
    }, []);
    // Set ducking config — live update, no tunnel restart needed.
    const setTunnelDucking = useCallback((id, duckingEnabled, duckingAmount, duckingRelease) => {
        setTunnels((ts) => ts.map((t) => t.id !== id
            ? t
            : { ...t, duckingEnabled, duckingAmount, duckingRelease }));
        const current = tunnelsRef.current.find((t) => t.id === id);
        if (current?.active) {
            tauriAPI.setTunnelDucking(id, {
                enabled: duckingEnabled,
                amount: duckingAmount,
                release: duckingRelease,
            });
        }
    }, []);
    // Rename — only touches the name, never restarts the stream.
    const renameTunnel = useCallback((id, name) => {
        setTunnels((ts) => ts.map((t) => (t.id === id ? { ...t, name } : t)));
    }, []);
    // Reorder via drag-and-drop.
    const reorderTunnels = useCallback((from, to) => {
        if (from === to)
            return;
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
        if (!raw)
            return;
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed))
                return;
            // Destroy all active tunnels before replacing state
            for (const t of tunnelsRef.current) {
                if (t.active)
                    await tauriAPI.destroyTunnel(t.id);
            }
            const imported = parsed.map((t) => {
                const inputs = Array.isArray(t.inputs) && t.inputs.length > 0
                    ? t.inputs.map((inp) => ({
                        deviceId: typeof inp.deviceId === "number" ? inp.deviceId : null,
                        appPid: typeof inp.appPid === "number" ? inp.appPid : null,
                        gain: typeof inp.gain === "number" ? inp.gain : 1,
                        priority: typeof inp.priority === "boolean" ? inp.priority : false,
                    }))
                    : [
                        {
                            deviceId: typeof t.inputDeviceId === "number"
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
                    outputDeviceId: typeof t.outputDeviceId === "number" ? t.outputDeviceId : null,
                    active: false,
                    muted: false,
                    channelCount: typeof t.channelCount === "number" ? t.channelCount : null,
                    gain: typeof t.gain === "number" ? t.gain : 1,
                    duckingEnabled: typeof t.duckingEnabled === "boolean" ? t.duckingEnabled : false,
                    duckingAmount: typeof t.duckingAmount === "number" ? t.duckingAmount : 0.15,
                    duckingRelease: typeof t.duckingRelease === "number" ? t.duckingRelease : 1000,
                };
            });
            setTunnels(imported);
        }
        catch {
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
            }
            else if (stage === "extracting")
                setInstallState("extracting");
            else if (stage === "launching")
                setInstallState("launching");
        });
        try {
            await tauriAPI.downloadAndInstallVBAudio();
            setInstallState("done");
        }
        catch (e) {
            setInstallError(e instanceof Error ? e.message : String(e));
            setInstallState("error");
        }
        finally {
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
        if (installed)
            setVbToastDismissed(false);
    }, []);
    // Auto-rescan when the window regains focus so newly installed
    // VB-Audio devices appear without a manual rescan or restart
    useEffect(() => {
        window.addEventListener("focus", rescanDevices);
        return () => window.removeEventListener("focus", rescanDevices);
    }, [rescanDevices]);
    const activeCableCount = tunnels.filter((t) => t.active).length;
    const showToast = vbInstalled === false && !vbToastDismissed && installState === "idle";
    const showProgress = installState !== "idle" && installState !== "done";
    const progressLabel = {
        idle: "",
        downloading: `Downloading… ${installPct}%`,
        extracting: "Extracting…",
        launching: "Launching installer…",
        done: "",
        error: `Error: ${installError}`,
    };
    return (_jsxs("div", { className: "app-root", children: [_jsxs("header", { className: "app-header", children: [_jsxs("div", { className: "header-brand", children: [_jsx("span", { className: "brand-mark", children: "VIRTUAL CABLE" }), _jsx("span", { className: "brand-ver", children: "patchbay v1" })] }), _jsxs("div", { className: "header-meta", children: [_jsxs("div", { className: "meta-stat", children: [_jsx("span", { className: "meta-val", children: String(tunnels.length).padStart(2, "0") }), _jsx("span", { className: "meta-label", children: "cables" })] }), _jsx("div", { className: "meta-divider" }), _jsxs("div", { className: "meta-stat", children: [_jsx("span", { className: `meta-val ${activeCableCount > 0 ? "live" : ""}`, children: String(activeCableCount).padStart(2, "0") }), _jsx("span", { className: "meta-label", children: "live" })] }), _jsx("div", { className: "meta-divider" }), vbInstalled === true ? (_jsxs("span", { className: "meta-vb-ok", children: [_jsx(CheckCircle2, { size: 13, strokeWidth: 2.5 }), "VB-Audio"] })) : (_jsx("button", { className: "header-rescan-btn", onClick: rescanDevices, title: "Re-scan audio devices", children: _jsx(RefreshCw, { size: 14, strokeWidth: 2 }) })), _jsx("div", { className: "meta-divider" }), _jsx("button", { className: "header-settings-btn", onClick: exportLayout, title: "Export cable layout", children: _jsx(Download, { size: 14, strokeWidth: 1.75 }) }), _jsx("button", { className: "header-settings-btn", onClick: importLayout, title: "Import cable layout", children: _jsx(Upload, { size: 14, strokeWidth: 1.75 }) }), _jsx("div", { className: "meta-divider" }), _jsx("button", { className: "header-settings-btn", onClick: () => setSettingsOpen(true), title: "Settings", children: _jsx(Settings, { size: 15, strokeWidth: 1.75 }) })] })] }), _jsx("main", { className: "app-main", children: _jsx("div", { className: "cables-container", children: _jsx(TunnelList, { tunnels: tunnels, devices: devices, audioApps: audioApps, onUpdate: updateTunnel, onToggleActive: toggleTunnelActive, onToggleMute: toggleTunnelMute, onSetGain: setTunnelGain, onSetInputGain: setTunnelInputGain, onSetInputPriority: setTunnelInputPriority, onSetDucking: setTunnelDucking, onRename: renameTunnel, onReorder: reorderTunnels, onDelete: deleteTunnel, expSampleRate: settings.experimentalFeatures && settings.expSampleRate }) }) }), _jsxs("button", { className: "fab-new", onClick: addTunnel, children: [_jsx(Plus, { size: 14, strokeWidth: 2.5 }), "New Cable"] }), showToast && (_jsxs("div", { className: "vb-toast", children: [_jsx("div", { className: "vb-toast-content", children: _jsxs("div", { className: "vb-toast-row", children: [_jsx("span", { className: "vb-toast-icon", children: _jsx(Hexagon, { size: 18, strokeWidth: 1.5 }) }), _jsxs("div", { className: "vb-toast-text", children: [_jsx("span", { className: "vb-toast-title", children: "VB-Audio not detected" }), _jsx("span", { className: "vb-toast-sub", children: "Required for virtual devices visible to other apps." })] })] }) }), _jsxs("div", { className: "vb-toast-actions", children: [_jsxs("button", { className: "vb-toast-install", onClick: () => setVbModalOpen(true), children: ["Install ", _jsx(ExternalLink, { size: 12, strokeWidth: 2 })] }), _jsx("button", { className: "vb-toast-dismiss", onClick: () => setVbToastDismissed(true), children: _jsx(X, { size: 14, strokeWidth: 2 }) })] })] })), showProgress && (_jsxs("div", { className: `vb-toast${installState === "error" ? " is-error" : ""}`, children: [_jsxs("div", { className: "vb-toast-content", children: [_jsxs("div", { className: "vb-toast-row", children: [_jsx("span", { className: "vb-toast-icon", children: installState === "error" ? (_jsx(AlertCircle, { size: 18, strokeWidth: 1.5 })) : (_jsx(Hexagon, { size: 18, strokeWidth: 1.5 })) }), _jsxs("div", { className: "vb-toast-text", children: [_jsx("span", { className: "vb-toast-title", children: installState === "error"
                                                    ? "Install failed"
                                                    : "Installing VB-Audio" }), _jsx("span", { className: "vb-toast-sub", children: progressLabel[installState] })] })] }), installState === "downloading" && (_jsx("div", { className: "vb-toast-bar", children: _jsx("div", { className: "vb-toast-bar-fill", style: { width: `${installPct}%` } }) }))] }), installState === "error" && (_jsxs("div", { className: "vb-toast-actions", children: [_jsxs("button", { className: "vb-toast-install", onClick: handleOpenPage, children: ["Open page ", _jsx(ExternalLink, { size: 12, strokeWidth: 2 })] }), _jsx("button", { className: "vb-toast-dismiss", onClick: () => {
                                    setInstallState("idle");
                                    setVbToastDismissed(false);
                                }, children: _jsx(X, { size: 14, strokeWidth: 2 }) })] }))] })), _jsx(SettingsPanel, { open: settingsOpen, onClose: () => {
                    setSettingsOpen(false);
                    tauriAPI.loadSettings().then(setSettings);
                } }), _jsx(VBInstallModal, { open: vbModalOpen, onInstall: handleDownloadInstall, onOpenPage: handleOpenPage, onDismiss: () => setVbModalOpen(false) })] }));
}
//# sourceMappingURL=App.js.map