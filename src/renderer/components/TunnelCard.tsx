import { useEffect, useRef, useState } from "react";
import {
  GripVertical,
  Plus,
  Power,
  Star,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import type { AudioDevice, Tunnel, TunnelInput } from "../../types";

interface Props {
  tunnel: Tunnel;
  devices: AudioDevice[];
  audioApps: { pid: number; name: string; exe: string }[];
  onUpdate: (tunnel: Tunnel) => void;
  onToggleActive: (id: string) => void;
  onToggleMute: (id: string) => void;
  onSetGain: (id: string, gain: number) => void;
  onSetInputGain: (id: string, inputIndex: number, gain: number) => void;
  onSetInputPriority: (
    id: string,
    inputIndex: number,
    priority: boolean,
  ) => void;
  onSetDucking: (
    id: string,
    enabled: boolean,
    amount: number,
    release: number,
  ) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  expSampleRate: boolean;
}

export default function TunnelCard({
  tunnel,
  devices,
  audioApps,
  onUpdate,
  onToggleActive,
  onToggleMute,
  onSetGain,
  onSetInputGain,
  onSetInputPriority,
  onSetDucking,
  onRename,
  onDelete,
  expSampleRate,
}: Props) {
  const inputDevices = devices.filter((d) => d.maxInputChannels > 0);
  const outputDevices = devices.filter((d) => d.maxOutputChannels > 0);

  // Cable can activate when every input slot has either a device or an app selected
  const canActivate =
    tunnel.inputs.length > 0 &&
    tunnel.inputs.every(
      (inp) => inp.deviceId !== null || inp.appPid !== null,
    ) &&
    tunnel.outputDeviceId !== null;

  // Channel count: limited by primary input + output capabilities
  const primaryInput = devices.find((d) => d.id === tunnel.inputs[0]?.deviceId);
  const selectedOutput = devices.find((d) => d.id === tunnel.outputDeviceId);
  const maxChannels =
    primaryInput && selectedOutput
      ? Math.min(
          primaryInput.maxInputChannels,
          selectedOutput.maxOutputChannels,
        )
      : 8;
  const channelOptions = [1, 2, 4, 6, 8].filter((n) => n <= maxChannels);

  const vuBarRef = useRef<HTMLDivElement>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [activeChannelCount, setActiveChannelCount] = useState<number | null>(
    null,
  );
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(tunnel.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // VU meter — direct DOM writes, no re-renders
  useEffect(() => {
    if (!vuBarRef.current) return;
    if (!tunnel.active) {
      vuBarRef.current.style.width = "0%";
      return;
    }
    const unsub = window.electronAPI.onAudioLevel((id, level) => {
      if (id !== tunnel.id || !vuBarRef.current) return;
      vuBarRef.current.style.width = `${level * 100}%`;
    });
    return unsub;
  }, [tunnel.active, tunnel.id]);

  // Sample rate + negotiated channel count — fetched once when the tunnel goes active.
  // The cancelled flag prevents stale IPC responses from writing back after the tunnel
  // deactivates (or this effect re-runs) before the async calls resolve.
  useEffect(() => {
    if (!tunnel.active) {
      setSampleRate(null);
      setActiveChannelCount(null);
      return;
    }
    let cancelled = false;
    if (expSampleRate) {
      window.electronAPI.getTunnelSampleRate(tunnel.id).then((v) => {
        if (!cancelled) setSampleRate(v);
      });
    }
    window.electronAPI.getTunnelChannelCount(tunnel.id).then((v) => {
      if (!cancelled) setActiveChannelCount(v);
    });
    return () => {
      cancelled = true;
    };
  }, [tunnel.active, tunnel.id, expSampleRate]);

  // Auto-focus the name input when entering edit mode
  useEffect(() => {
    if (editing) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [editing]);

  const commitRename = () => {
    const name = editName.trim() || tunnel.name;
    setEditing(false);
    setEditName(name);
    onRename(tunnel.id, name);
  };

  const cancelRename = () => {
    setEditing(false);
    setEditName(tunnel.name);
  };

  // Deactivating tunnel-level changes (devices, channels, inputs list)
  const set = (patch: Partial<Tunnel>) => {
    onUpdate({ ...tunnel, ...patch, active: false });
  };

  const setOutputDevice = (deviceId: number | null) => {
    onUpdate({ ...tunnel, outputDeviceId: deviceId, active: false });
  };

  // Value encoding: "d:<deviceId>" for devices, "a:<pid>" for apps, "" for none.
  const inputSelectValue = (inp: TunnelInput): string => {
    if (inp.appPid !== null) return `a:${inp.appPid}`;
    if (inp.deviceId !== null) return `d:${inp.deviceId}`;
    return "";
  };

  const setInputSource = (index: number, encoded: string) => {
    let deviceId: number | null = null;
    let appPid: number | null = null;
    if (encoded.startsWith("d:")) deviceId = Number(encoded.slice(2));
    else if (encoded.startsWith("a:")) appPid = Number(encoded.slice(2));
    const inputs = tunnel.inputs.map((inp, i) =>
      i === index ? { ...inp, deviceId, appPid } : inp,
    );
    onUpdate({ ...tunnel, inputs, active: false });
  };

  const addInput = () => {
    onUpdate({
      ...tunnel,
      inputs: [
        ...tunnel.inputs,
        { deviceId: null, appPid: null, gain: 1, priority: false },
      ],
      active: false,
    });
  };

  const removeInput = (index: number) => {
    if (tunnel.inputs.length <= 1) return;
    onUpdate({
      ...tunnel,
      inputs: tunnel.inputs.filter((_, i) => i !== index),
      active: false,
    });
  };

  const toggleActive = () => {
    if (!canActivate) return;
    onToggleActive(tunnel.id);
  };

  const toggleMute = () => {
    if (tunnel.active) onToggleMute(tunnel.id);
  };

  const srLabel =
    sampleRate !== null
      ? sampleRate >= 1000
        ? `${sampleRate / 1000} kHz`
        : `${sampleRate} Hz`
      : null;

  const gainDb =
    tunnel.gain === 0
      ? "-∞ dB"
      : `${tunnel.gain >= 1 ? "+" : ""}${(20 * Math.log10(tunnel.gain)).toFixed(1)} dB`;

  return (
    <div className={`cable-card${tunnel.active ? " is-active" : ""}`}>
      {/* Card header */}
      <div className="card-head">
        <span className="card-grip" title="Drag to reorder">
          <GripVertical size={13} strokeWidth={1.75} />
        </span>
        {editing ? (
          <input
            ref={nameInputRef}
            className="card-name-input"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") cancelRename();
            }}
          />
        ) : (
          <span
            className="card-name"
            onClick={() => {
              setEditName(tunnel.name);
              setEditing(true);
            }}
            title="Click to rename"
          >
            {tunnel.name}
          </span>
        )}
        <button
          className="card-delete"
          onClick={() => onDelete(tunnel.id)}
          title="Delete cable"
        >
          <Trash2 size={13} strokeWidth={2} />
        </button>
      </div>

      {/* Routing row: [inputs list] [connector] [output] */}
      <div className="routing-row">
        {/* Inputs column */}
        <div className="inputs-group">
          <span className="device-label">
            Input{tunnel.inputs.length > 1 ? `s (${tunnel.inputs.length})` : ""}
          </span>
          {tunnel.inputs.map((inp, i) => {
            const inpGainDb =
              inp.gain === 0
                ? "-∞"
                : `${inp.gain >= 1 ? "+" : ""}${(20 * Math.log10(inp.gain)).toFixed(1)}`;
            return (
              <div key={i} className="input-row">
                <select
                  className="device-select input-row-select"
                  value={inputSelectValue(inp)}
                  onChange={(e) => setInputSource(i, e.target.value)}
                >
                  <option value="">— select —</option>
                  {inputDevices.length > 0 && (
                    <optgroup label="Audio Devices">
                      {inputDevices.map((d) => (
                        <option key={`d:${d.id}`} value={`d:${d.id}`}>
                          {d.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {audioApps.length > 0 && (
                    <optgroup label="Apps">
                      {audioApps.map((a) => (
                        <option key={`a:${a.pid}`} value={`a:${a.pid}`}>
                          {a.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <input
                  className="input-gain-slider"
                  type="range"
                  min={0}
                  max={200}
                  step={1}
                  value={Math.round(inp.gain * 100)}
                  onChange={(e) =>
                    onSetInputGain(tunnel.id, i, Number(e.target.value) / 100)
                  }
                  onDoubleClick={() => onSetInputGain(tunnel.id, i, 1)}
                  title="Per-input gain (double-click to reset)"
                />
                <span
                  className={`input-gain-db${inp.gain !== 1 ? " is-adjusted" : ""}`}
                >
                  {inpGainDb}
                </span>
                <button
                  className={`input-priority-btn${inp.priority ? " is-active" : ""}`}
                  onClick={() =>
                    onSetInputPriority(tunnel.id, i, !inp.priority)
                  }
                  title={
                    inp.priority
                      ? "Priority (click to unset)"
                      : "Set as priority input"
                  }
                >
                  <Star
                    size={10}
                    strokeWidth={inp.priority ? 0 : 1.5}
                    fill={inp.priority ? "currentColor" : "none"}
                  />
                </button>
                {tunnel.inputs.length > 1 && (
                  <button
                    className="input-remove-btn"
                    onClick={() => removeInput(i)}
                    title="Remove input"
                  >
                    <X size={11} strokeWidth={2} />
                  </button>
                )}
              </div>
            );
          })}
          <button className="add-input-btn" onClick={addInput}>
            <Plus size={11} strokeWidth={2.5} />
            Add Input
          </button>
        </div>

        {/* Animated cable connector */}
        <div className="cable-connector">
          <div className={`cable-jack${tunnel.active ? " is-active" : ""}`} />
          <div className={`cable-track${tunnel.active ? " is-active" : ""}`}>
            {tunnel.active && <div className="cable-pulse" />}
          </div>
          <div className={`cable-jack${tunnel.active ? " is-active" : ""}`} />
        </div>

        {/* Output column */}
        <div className="device-group">
          <span className="device-label">Output</span>
          <select
            className="device-select"
            value={tunnel.outputDeviceId ?? ""}
            onChange={(e) =>
              setOutputDevice(
                e.target.value !== "" ? Number(e.target.value) : null,
              )
            }
          >
            <option value="">— select —</option>
            {outputDevices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {expSampleRate && (
            <span
              className="card-sample-rate"
              style={{ visibility: srLabel ? "visible" : "hidden" }}
            >
              {srLabel ?? "\u00A0"}
            </span>
          )}
        </div>
      </div>

      {/* Channel count row */}
      <div className="channel-row">
        <span className="channel-label">Channels</span>
        <div className="channel-options">
          <button
            className={`channel-btn${tunnel.channelCount === null ? " is-active" : ""}`}
            onClick={() => set({ channelCount: null })}
          >
            Auto
            {tunnel.active &&
            activeChannelCount !== null &&
            tunnel.channelCount === null
              ? ` (${activeChannelCount})`
              : ""}
          </button>
          {channelOptions.map((n) => (
            <button
              key={n}
              className={`channel-btn${tunnel.channelCount === n ? " is-active" : ""}`}
              onClick={() => set({ channelCount: n })}
            >
              {n === 1 ? "Mono" : n === 2 ? "Stereo" : `${n}ch`}
            </button>
          ))}
        </div>
      </div>

      {/* Ducking section — only when multiple inputs exist */}
      {tunnel.inputs.length > 1 && (
        <div className="ducking-row">
          <span className="ducking-label">Ducking</span>
          <button
            className={`ducking-toggle${tunnel.duckingEnabled ? " is-active" : ""}`}
            onClick={() =>
              onSetDucking(
                tunnel.id,
                !tunnel.duckingEnabled,
                tunnel.duckingAmount,
                tunnel.duckingRelease,
              )
            }
          >
            {tunnel.duckingEnabled ? "On" : "Off"}
          </button>
          {tunnel.duckingEnabled && (
            <>
              <span className="ducking-sub-label">Amt</span>
              <input
                className="ducking-slider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(tunnel.duckingAmount * 100)}
                onChange={(e) =>
                  onSetDucking(
                    tunnel.id,
                    tunnel.duckingEnabled,
                    Number(e.target.value) / 100,
                    tunnel.duckingRelease,
                  )
                }
                onDoubleClick={() =>
                  onSetDucking(
                    tunnel.id,
                    tunnel.duckingEnabled,
                    0.15,
                    tunnel.duckingRelease,
                  )
                }
                title="How much non-priority inputs are reduced (double-click to reset)"
              />
              <span className="ducking-amt-db">
                {tunnel.duckingAmount === 0
                  ? "−∞"
                  : `${(20 * Math.log10(tunnel.duckingAmount)).toFixed(0)}`}
                dB
              </span>
              <span className="ducking-sub-label">Rel</span>
              <input
                className="ducking-release-slider"
                type="range"
                min={50}
                max={5000}
                step={50}
                value={tunnel.duckingRelease}
                onChange={(e) =>
                  onSetDucking(
                    tunnel.id,
                    tunnel.duckingEnabled,
                    tunnel.duckingAmount,
                    Number(e.target.value),
                  )
                }
                title="Release time — how quickly non-priority inputs recover"
              />
              <span className="ducking-release-val">
                {tunnel.duckingRelease}ms
              </span>
            </>
          )}
        </div>
      )}

      {/* Gain slider */}
      <div className="gain-row">
        <span className="gain-label">Gain</span>
        <input
          className="gain-slider"
          type="range"
          min={0}
          max={200}
          step={1}
          value={Math.round(tunnel.gain * 100)}
          onChange={(e) => onSetGain(tunnel.id, Number(e.target.value) / 100)}
          onDoubleClick={() => onSetGain(tunnel.id, 1)}
          title="Double-click to reset to unity (0 dB)"
        />
        <span className={`gain-db${tunnel.gain !== 1 ? " is-adjusted" : ""}`}>
          {gainDb}
        </span>
      </div>

      {/* VU meter */}
      <div className="vu-meter">
        <div className="vu-bar" ref={vuBarRef} />
      </div>

      {/* Toggle */}
      <div className="card-foot">
        <button
          className={`cable-toggle${tunnel.active ? " is-active" : ""}`}
          onClick={toggleActive}
          disabled={!canActivate}
          title={!canActivate ? "Select input and output first" : undefined}
        >
          <Power size={12} strokeWidth={2.5} />
          {tunnel.active ? "Live" : "Offline"}
        </button>
        <button
          className={`cable-mute${tunnel.muted ? " is-muted" : ""}`}
          onClick={toggleMute}
          disabled={!tunnel.active}
          title={
            !tunnel.active
              ? "Activate cable first"
              : tunnel.muted
                ? "Unmute"
                : "Mute"
          }
        >
          {tunnel.muted ? (
            <VolumeX size={13} strokeWidth={2} />
          ) : (
            <Volume2 size={13} strokeWidth={2} />
          )}
        </button>
      </div>
    </div>
  );
}
