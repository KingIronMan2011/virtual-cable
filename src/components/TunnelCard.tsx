import { useEffect, useLayoutEffect, useRef, useState } from "react";
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
import type { AudioDevice, Tunnel } from "../types";
import { tauriAPI } from "../tauriAPI";
import HotkeyInput from "./HotkeyInput";

interface Props {
  tunnel: Tunnel;
  isToggling: boolean;
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
}

function dbLabel(gain: number, decimals = 1) {
  if (gain === 0) return "−∞";
  return `${gain >= 1 ? "+" : ""}${(20 * Math.log10(gain)).toFixed(decimals)}`;
}

export default function TunnelCard({
  tunnel,
  isToggling,
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
}: Props) {
  const inputDevices = devices.filter((d) => d.maxInputChannels > 0);
  const outputDevices = devices.filter((d) => d.maxOutputChannels > 0);

  const maxCh =
    outputDevices.find((d) => d.id === tunnel.outputDeviceId)
      ?.maxOutputChannels ?? 8;
  const channelOptions = [1, 2, 4, 6, 8].filter((n) => n <= maxCh);

  const canActivate =
    tunnel.inputs.some((inp) => inp.deviceId !== null || inp.appPid !== null) &&
    tunnel.outputDeviceId !== null;

  const vuBarRef = useRef<HTMLDivElement>(null);
  const cableRef = useRef<HTMLDivElement>(null);
  const inputRowsRef = useRef<HTMLDivElement>(null);
  // Pixel-accurate bounds of the input-rows area within the cable column.
  // The output jack is always placed at (top + bot) / 2 — the vertical midpoint
  // of all input jacks — so for 2 inputs it falls between them, for 3 on the middle one, etc.
  const [cableH, setCableH] = useState(48);
  const [anchors, setAnchors] = useState({ top: 0, bot: 48 });

  useLayoutEffect(() => {
    const measure = () => {
      const cable = cableRef.current;
      if (!cable) return;
      const cr = cable.getBoundingClientRect();
      setCableH(Math.round(cr.height));
      let top = 0,
        bot = cr.height;
      const rows = inputRowsRef.current;
      if (rows) {
        const rr = rows.getBoundingClientRect();
        top = rr.top - cr.top;
        bot = rr.bottom - cr.top;
      }
      setAnchors({ top, bot });
    };
    measure();
    const obs = new ResizeObserver(measure);
    if (cableRef.current) obs.observe(cableRef.current);
    return () => obs.disconnect();
  }, [tunnel.inputs.length]);

  const [sampleRate, setSampleRate] = useState<number | null>(null);
  const [activeChannelCount, setActiveChannelCount] = useState<number | null>(
    null,
  );
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(tunnel.name);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // VU meter — direct DOM writes to avoid re-renders on every audio frame
  useEffect(() => {
    if (!vuBarRef.current) return;
    if (!tunnel.active) {
      vuBarRef.current.style.width = "0%";
      return;
    }
    const unsub = tauriAPI.onAudioLevel((id, level) => {
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
    tauriAPI.getTunnelSampleRate(tunnel.id).then((v) => {
      if (!cancelled) setSampleRate(v);
    });
    tauriAPI.getTunnelChannelCount(tunnel.id).then((v) => {
      if (!cancelled) setActiveChannelCount(v);
    });
    return () => {
      cancelled = true;
    };
  }, [tunnel.active, tunnel.id]);

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

  // Any structural change (device, channel count, inputs) deactivates the tunnel
  const set = (patch: Partial<Tunnel>) =>
    onUpdate({ ...tunnel, ...patch, active: false });

  const setOutputDevice = (deviceId: number | null) =>
    onUpdate({ ...tunnel, outputDeviceId: deviceId, active: false });

  const inputSelectValue = (inp: (typeof tunnel.inputs)[0]) => {
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

  const addInput = () =>
    onUpdate({
      ...tunnel,
      inputs: [
        ...tunnel.inputs,
        { deviceId: null, appPid: null, gain: 1, priority: false },
      ],
      active: false,
    });

  const removeInput = (index: number) => {
    if (tunnel.inputs.length <= 1) return;
    onUpdate({
      ...tunnel,
      inputs: tunnel.inputs.filter((_, i) => i !== index),
      active: false,
    });
  };

  const srLabel =
    sampleRate !== null
      ? sampleRate >= 1000
        ? `${sampleRate / 1000} kHz`
        : `${sampleRate} Hz`
      : null;

  // Pixel offset from the grid-row centre to the cable's output jack.
  // Used to translateY the output column so its centre matches the jack exactly.
  const outputJackY = (anchors.top + anchors.bot) / 2;
  const outputColShift = outputJackY - cableH / 2;

  return (
    <div
      className={`cable-card${tunnel.active ? "is-active" : ""}`}
      tabIndex={0}
      onKeyDown={(e) => {
        // Don't trigger if user is typing in an input/select inside the card
        if (
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLSelectElement
        ) {
          return;
        }

        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          if (canActivate && !isToggling) onToggleActive(tunnel.id);
        }

        if (e.key.toLowerCase() === "m") {
          if (tunnel.active) onToggleMute(tunnel.id);
        }
      }}
    >
      {/* ── Header: grip · name · delete ── */}
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
          title="Delete"
        >
          <Trash2 size={13} strokeWidth={2} />
        </button>
      </div>

      {/* ── I/O routing: inputs · cable · output ── */}
      <div className="io-row">
        {/* Inputs column */}
        <div className="io-col">
          <span className="io-label">In</span>
          <div ref={inputRowsRef} className="input-rows">
            {tunnel.inputs.map((inp, i) => (
              <div key={i} className="input-row">
                <select
                  className="device-select"
                  value={inputSelectValue(inp)}
                  onChange={(e) => setInputSource(i, e.target.value)}
                >
                  <option value="">— select —</option>
                  {inputDevices.length > 0 && (
                    <>
                      {inputDevices.some((d) => d.isVirtual) && (
                        <optgroup label="VB-Audio Cables">
                          {inputDevices
                            .filter((d) => d.isVirtual)
                            .map((d) => (
                              <option key={`d:${d.id}`} value={`d:${d.id}`}>
                                {d.name}
                              </option>
                            ))}
                        </optgroup>
                      )}
                      {inputDevices.some((d) => !d.isVirtual) && (
                        <optgroup label="Hardware Devices">
                          {inputDevices
                            .filter((d) => !d.isVirtual)
                            .map((d) => (
                              <option key={`d:${d.id}`} value={`d:${d.id}`}>
                                {d.name}
                              </option>
                            ))}
                        </optgroup>
                      )}
                    </>
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
                  className={`gain-val${inp.gain !== 1 ? "is-adjusted" : ""}`}
                >
                  {dbLabel(inp.gain)}
                </span>
                <button
                  className={`icon-btn${inp.priority ? "is-priority" : ""}`}
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
                    size={12}
                    strokeWidth={inp.priority ? 0 : 1.5}
                    fill={inp.priority ? "currentColor" : "none"}
                  />
                </button>
                {tunnel.inputs.length > 1 && (
                  <button
                    className="icon-btn"
                    onClick={() => removeInput(i)}
                    title="Remove input"
                  >
                    <X size={15} strokeWidth={2} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button className="add-input-btn" onClick={addInput}>
            <Plus size={15} strokeWidth={2.5} /> Add
          </button>
        </div>

        {/* Cable topology — SVG bezier curves: N inputs → smooth merge → output */}
        <div ref={cableRef} className="cable-connector">
          {(() => {
            const n = tunnel.inputs.length;
            const act = tunnel.active;
            // Real pixel coordinates derived from measured DOM positions so jacks
            // align with the actual select/label elements, not the full grid row.
            const W = 80,
              H = cableH;
            const jx = 12,
              bx = 40,
              ox = 68;
            const mx = (jx + bx) / 2; // bezier control-point x
            const span = anchors.bot - anchors.top;
            const ys = Array.from(
              { length: n },
              (_, i) => anchors.top + ((2 * i + 1) / (2 * n)) * span,
            );
            // Output jack sits at the vertical midpoint of all input jacks:
            // midpoint of 2 → between them; midpoint of 3 → on the middle one; etc.
            const oy = (anchors.top + anchors.bot) / 2;
            return (
              <svg
                viewBox={`0 0 ${W} ${H}`}
                width={W}
                height={H}
                className="cable-svg"
              >
                {/* Branch curves: each input bezier-curves into the central junction */}
                {ys.map((iy, i) => (
                  <path
                    key={i}
                    d={
                      n === 1
                        ? `M ${jx} ${oy} L ${ox} ${oy}`
                        : `M ${jx} ${iy} C ${mx} ${iy} ${mx} ${oy} ${bx} ${oy}`
                    }
                    fill="none"
                    className={`c-branch${act ? "is-active" : ""}`}
                  />
                ))}
                {/* Output track (multi-input only; single reuses the branch path) */}
                {n > 1 && (
                  <line
                    x1={bx}
                    y1={oy}
                    x2={ox}
                    y2={oy}
                    className={`c-branch${act ? "is-active" : ""}`}
                  />
                )}
                {/* Animated pulse travelling along the output segment */}
                {act && (
                  <line
                    x1={n > 1 ? bx : jx}
                    y1={oy}
                    x2={ox}
                    y2={oy}
                    className="c-pulse"
                  />
                )}
                {/* Input jacks */}
                {ys.map((iy, i) => (
                  <circle
                    key={i}
                    cx={jx}
                    cy={iy}
                    r={5}
                    className={`c-jack${act ? "is-active" : ""}`}
                  />
                ))}
                {/* Junction dot where all branches converge */}
                {n > 1 && (
                  <circle
                    cx={bx}
                    cy={oy}
                    r={4}
                    className={`c-jack${act ? "is-active" : ""}`}
                  />
                )}
                {/* Output jack */}
                <circle
                  cx={ox}
                  cy={oy}
                  r={5}
                  className={`c-jack${act ? "is-active" : ""}`}
                />
              </svg>
            );
          })()}
        </div>

        {/* Output column — shifted so its centre aligns with the cable's output jack */}
        <div
          className="io-col io-col--out"
          style={{ transform: `translateY(${outputColShift}px)` }}
        >
          <span className="io-label">Out</span>
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
            {outputDevices.length > 0 && (
              <>
                {outputDevices.some((d) => d.isVirtual) && (
                  <optgroup label="VB-Audio Cables">
                    {outputDevices
                      .filter((d) => d.isVirtual)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </optgroup>
                )}
                {outputDevices.some((d) => !d.isVirtual) && (
                  <optgroup label="Hardware Devices">
                    {outputDevices
                      .filter((d) => !d.isVirtual)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </optgroup>
                )}
              </>
            )}
          </select>
          {srLabel && <span className="io-meta">{srLabel}</span>}
        </div>
      </div>

      {/* ── Controls: channel picker · cable · master gain ── */}
      <div className="controls-row">
        <div className="ch-picker">
          <button
            className={`ch-btn${tunnel.channelCount === null ? "is-active" : ""}`}
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
              className={`ch-btn${tunnel.channelCount === n ? "is-active" : ""}`}
              onClick={() => set({ channelCount: n })}
            >
              {n === 1 ? "Mono" : n === 2 ? "Stereo" : `${n}ch`}
            </button>
          ))}
        </div>
        <div className="gain-ctrl">
          <input
            className="gain-slider"
            type="range"
            min={0}
            max={200}
            step={1}
            value={Math.round(tunnel.gain * 100)}
            onChange={(e) => onSetGain(tunnel.id, Number(e.target.value) / 100)}
            onDoubleClick={() => onSetGain(tunnel.id, 1)}
            title="Master gain — double-click to reset to 0 dB"
          />
          <span className={`gain-val${tunnel.gain !== 1 ? "is-adjusted" : ""}`}>
            {dbLabel(tunnel.gain)} dB
          </span>
        </div>
      </div>

      {/* ── Ducking — only when multiple inputs exist ── */}
      {tunnel.inputs.length > 1 && (
        <div className="ducking-row">
          <button
            className={`duck-toggle${tunnel.duckingEnabled ? "is-active" : ""}`}
            onClick={() =>
              onSetDucking(
                tunnel.id,
                !tunnel.duckingEnabled,
                tunnel.duckingAmount,
                tunnel.duckingRelease,
              )
            }
          >
            Duck
          </button>
          {tunnel.duckingEnabled && (
            <>
              <input
                className="duck-slider"
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(tunnel.duckingAmount * 100)}
                onChange={(e) =>
                  onSetDucking(
                    tunnel.id,
                    true,
                    Number(e.target.value) / 100,
                    tunnel.duckingRelease,
                  )
                }
                onDoubleClick={() =>
                  onSetDucking(tunnel.id, true, 0.15, tunnel.duckingRelease)
                }
                title="Duck amount (double-click to reset)"
              />
              <span className="duck-val">
                {tunnel.duckingAmount === 0
                  ? "−∞"
                  : `${(20 * Math.log10(tunnel.duckingAmount)).toFixed(0)}`}{" "}
                dB
              </span>
              <input
                className="duck-slider duck-slider--release"
                type="range"
                min={50}
                max={5000}
                step={50}
                value={tunnel.duckingRelease}
                onChange={(e) =>
                  onSetDucking(
                    tunnel.id,
                    true,
                    tunnel.duckingAmount,
                    Number(e.target.value),
                  )
                }
                title="Release time"
              />
              <span className="duck-val">{tunnel.duckingRelease} ms</span>
            </>
          )}
        </div>
      )}

      {/* ── VU meter ── */}
      <div className="vu-meter">
        <div className="vu-bar" ref={vuBarRef} />
      </div>

      {/* ── Footer: toggle + mute ── */}
      <div className="card-foot">
        <button
          className={`cable-toggle${tunnel.active ? "is-active" : ""}`}
          onClick={() => onToggleActive(tunnel.id)}
          disabled={!canActivate || isToggling}
          title={
            !canActivate
              ? "Select input and output first"
              : isToggling
                ? "Cooling down..."
                : undefined
          }
        >
          <Power size={12} strokeWidth={2.5} />
          {tunnel.active ? "Live" : "Offline"}
        </button>
        <button
          className={`cable-mute${tunnel.muted ? "is-muted" : ""}`}
          onClick={() => {
            if (tunnel.active) onToggleMute(tunnel.id);
          }}
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

        <div className="card-hotkey">
          <HotkeyInput
            value={tunnel.hotkey}
            onChange={(val) => onUpdate({ ...tunnel, hotkey: val })}
            placeholder="No key"
          />
        </div>
      </div>
    </div>
  );
}
