import {
  jsx as _jsx,
  jsxs as _jsxs,
  Fragment as _Fragment,
} from "react/jsx-runtime";
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
import { tauriAPI } from "../tauriAPI";
function dbLabel(gain, decimals = 1) {
  if (gain === 0) return "−∞";
  return `${gain >= 1 ? "+" : ""}${(20 * Math.log10(gain)).toFixed(decimals)}`;
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
}) {
  const inputDevices = devices.filter((d) => d.maxInputChannels > 0);
  const outputDevices = devices.filter((d) => d.maxOutputChannels > 0);
  const maxCh =
    outputDevices.find((d) => d.id === tunnel.outputDeviceId)
      ?.maxOutputChannels ?? 8;
  const channelOptions = [1, 2, 4, 6, 8].filter((n) => n <= maxCh);
  const canActivate =
    tunnel.inputs.some((inp) => inp.deviceId !== null || inp.appPid !== null) &&
    tunnel.outputDeviceId !== null;
  const vuBarRef = useRef(null);
  const cableRef = useRef(null);
  const inputRowsRef = useRef(null);
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
  const [sampleRate, setSampleRate] = useState(null);
  const [activeChannelCount, setActiveChannelCount] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(tunnel.name);
  const nameInputRef = useRef(null);
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
    if (expSampleRate) {
      tauriAPI.getTunnelSampleRate(tunnel.id).then((v) => {
        if (!cancelled) setSampleRate(v);
      });
    }
    tauriAPI.getTunnelChannelCount(tunnel.id).then((v) => {
      if (!cancelled) setActiveChannelCount(v);
    });
    return () => {
      cancelled = true;
    };
  }, [tunnel.active, tunnel.id, expSampleRate]);
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
  const set = (patch) => onUpdate({ ...tunnel, ...patch, active: false });
  const setOutputDevice = (deviceId) =>
    onUpdate({ ...tunnel, outputDeviceId: deviceId, active: false });
  const inputSelectValue = (inp) => {
    if (inp.appPid !== null) return `a:${inp.appPid}`;
    if (inp.deviceId !== null) return `d:${inp.deviceId}`;
    return "";
  };
  const setInputSource = (index, encoded) => {
    let deviceId = null;
    let appPid = null;
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
  const removeInput = (index) => {
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
  return _jsxs("div", {
    className: `cable-card${tunnel.active ? " is-active" : ""}`,
    children: [
      _jsxs("div", {
        className: "card-head",
        children: [
          _jsx("span", {
            className: "card-grip",
            title: "Drag to reorder",
            children: _jsx(GripVertical, { size: 13, strokeWidth: 1.75 }),
          }),
          editing
            ? _jsx("input", {
                ref: nameInputRef,
                className: "card-name-input",
                value: editName,
                onChange: (e) => setEditName(e.target.value),
                onBlur: commitRename,
                onKeyDown: (e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") cancelRename();
                },
              })
            : _jsx("span", {
                className: "card-name",
                onClick: () => {
                  setEditName(tunnel.name);
                  setEditing(true);
                },
                title: "Click to rename",
                children: tunnel.name,
              }),
          _jsx("button", {
            className: "card-delete",
            onClick: () => onDelete(tunnel.id),
            title: "Delete",
            children: _jsx(Trash2, { size: 13, strokeWidth: 2 }),
          }),
        ],
      }),
      _jsxs("div", {
        className: "io-row",
        children: [
          _jsxs("div", {
            className: "io-col",
            children: [
              _jsx("span", { className: "io-label", children: "In" }),
              _jsx("div", {
                ref: inputRowsRef,
                className: "input-rows",
                children: tunnel.inputs.map((inp, i) =>
                  _jsxs(
                    "div",
                    {
                      className: "input-row",
                      children: [
                        _jsxs("select", {
                          className: "device-select",
                          value: inputSelectValue(inp),
                          onChange: (e) => setInputSource(i, e.target.value),
                          children: [
                            _jsx("option", {
                              value: "",
                              children: "\u2014 select \u2014",
                            }),
                            inputDevices.length > 0 &&
                              _jsx("optgroup", {
                                label: "Audio Devices",
                                children: inputDevices.map((d) =>
                                  _jsx(
                                    "option",
                                    { value: `d:${d.id}`, children: d.name },
                                    `d:${d.id}`,
                                  ),
                                ),
                              }),
                            audioApps.length > 0 &&
                              _jsx("optgroup", {
                                label: "Apps",
                                children: audioApps.map((a) =>
                                  _jsx(
                                    "option",
                                    { value: `a:${a.pid}`, children: a.name },
                                    `a:${a.pid}`,
                                  ),
                                ),
                              }),
                          ],
                        }),
                        _jsx("input", {
                          className: "input-gain-slider",
                          type: "range",
                          min: 0,
                          max: 200,
                          step: 1,
                          value: Math.round(inp.gain * 100),
                          onChange: (e) =>
                            onSetInputGain(
                              tunnel.id,
                              i,
                              Number(e.target.value) / 100,
                            ),
                          onDoubleClick: () => onSetInputGain(tunnel.id, i, 1),
                          title: "Per-input gain (double-click to reset)",
                        }),
                        _jsx("span", {
                          className: `gain-val${inp.gain !== 1 ? " is-adjusted" : ""}`,
                          children: dbLabel(inp.gain),
                        }),
                        _jsx("button", {
                          className: `icon-btn${inp.priority ? " is-priority" : ""}`,
                          onClick: () =>
                            onSetInputPriority(tunnel.id, i, !inp.priority),
                          title: inp.priority
                            ? "Priority (click to unset)"
                            : "Set as priority input",
                          children: _jsx(Star, {
                            size: 10,
                            strokeWidth: inp.priority ? 0 : 1.5,
                            fill: inp.priority ? "currentColor" : "none",
                          }),
                        }),
                        tunnel.inputs.length > 1 &&
                          _jsx("button", {
                            className: "icon-btn",
                            onClick: () => removeInput(i),
                            title: "Remove input",
                            children: _jsx(X, { size: 11, strokeWidth: 2 }),
                          }),
                      ],
                    },
                    i,
                  ),
                ),
              }),
              _jsxs("button", {
                className: "add-input-btn",
                onClick: addInput,
                children: [_jsx(Plus, { size: 11, strokeWidth: 2.5 }), " Add"],
              }),
            ],
          }),
          _jsx("div", {
            ref: cableRef,
            className: "cable-connector",
            children: (() => {
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
              return _jsxs("svg", {
                viewBox: `0 0 ${W} ${H}`,
                width: W,
                height: H,
                className: "cable-svg",
                children: [
                  ys.map((iy, i) =>
                    _jsx(
                      "path",
                      {
                        d:
                          n === 1
                            ? `M ${jx} ${oy} L ${ox} ${oy}`
                            : `M ${jx} ${iy} C ${mx} ${iy} ${mx} ${oy} ${bx} ${oy}`,
                        fill: "none",
                        className: `c-branch${act ? " is-active" : ""}`,
                      },
                      i,
                    ),
                  ),
                  n > 1 &&
                    _jsx("line", {
                      x1: bx,
                      y1: oy,
                      x2: ox,
                      y2: oy,
                      className: `c-branch${act ? " is-active" : ""}`,
                    }),
                  act &&
                    _jsx("line", {
                      x1: n > 1 ? bx : jx,
                      y1: oy,
                      x2: ox,
                      y2: oy,
                      className: "c-pulse",
                    }),
                  ys.map((iy, i) =>
                    _jsx(
                      "circle",
                      {
                        cx: jx,
                        cy: iy,
                        r: 5,
                        className: `c-jack${act ? " is-active" : ""}`,
                      },
                      i,
                    ),
                  ),
                  n > 1 &&
                    _jsx("circle", {
                      cx: bx,
                      cy: oy,
                      r: 4,
                      className: `c-jack${act ? " is-active" : ""}`,
                    }),
                  _jsx("circle", {
                    cx: ox,
                    cy: oy,
                    r: 5,
                    className: `c-jack${act ? " is-active" : ""}`,
                  }),
                ],
              });
            })(),
          }),
          _jsxs("div", {
            className: "io-col io-col--out",
            style: { transform: `translateY(${outputColShift}px)` },
            children: [
              _jsx("span", { className: "io-label", children: "Out" }),
              _jsxs("select", {
                className: "device-select",
                value: tunnel.outputDeviceId ?? "",
                onChange: (e) =>
                  setOutputDevice(
                    e.target.value !== "" ? Number(e.target.value) : null,
                  ),
                children: [
                  _jsx("option", {
                    value: "",
                    children: "\u2014 select \u2014",
                  }),
                  outputDevices.map((d) =>
                    _jsx("option", { value: d.id, children: d.name }, d.id),
                  ),
                ],
              }),
              expSampleRate &&
                srLabel &&
                _jsx("span", { className: "io-meta", children: srLabel }),
            ],
          }),
        ],
      }),
      _jsxs("div", {
        className: "controls-row",
        children: [
          _jsxs("div", {
            className: "ch-picker",
            children: [
              _jsxs("button", {
                className: `ch-btn${tunnel.channelCount === null ? " is-active" : ""}`,
                onClick: () => set({ channelCount: null }),
                children: [
                  "Auto",
                  tunnel.active &&
                  activeChannelCount !== null &&
                  tunnel.channelCount === null
                    ? ` (${activeChannelCount})`
                    : "",
                ],
              }),
              channelOptions.map((n) =>
                _jsx(
                  "button",
                  {
                    className: `ch-btn${tunnel.channelCount === n ? " is-active" : ""}`,
                    onClick: () => set({ channelCount: n }),
                    children: n === 1 ? "Mono" : n === 2 ? "Stereo" : `${n}ch`,
                  },
                  n,
                ),
              ),
            ],
          }),
          _jsxs("div", {
            className: "gain-ctrl",
            children: [
              _jsx("input", {
                className: "gain-slider",
                type: "range",
                min: 0,
                max: 200,
                step: 1,
                value: Math.round(tunnel.gain * 100),
                onChange: (e) =>
                  onSetGain(tunnel.id, Number(e.target.value) / 100),
                onDoubleClick: () => onSetGain(tunnel.id, 1),
                title: "Master gain \u2014 double-click to reset to 0 dB",
              }),
              _jsxs("span", {
                className: `gain-val${tunnel.gain !== 1 ? " is-adjusted" : ""}`,
                children: [dbLabel(tunnel.gain), " dB"],
              }),
            ],
          }),
        ],
      }),
      tunnel.inputs.length > 1 &&
        _jsxs("div", {
          className: "ducking-row",
          children: [
            _jsx("button", {
              className: `duck-toggle${tunnel.duckingEnabled ? " is-active" : ""}`,
              onClick: () =>
                onSetDucking(
                  tunnel.id,
                  !tunnel.duckingEnabled,
                  tunnel.duckingAmount,
                  tunnel.duckingRelease,
                ),
              children: "Duck",
            }),
            tunnel.duckingEnabled &&
              _jsxs(_Fragment, {
                children: [
                  _jsx("input", {
                    className: "duck-slider",
                    type: "range",
                    min: 0,
                    max: 100,
                    step: 1,
                    value: Math.round(tunnel.duckingAmount * 100),
                    onChange: (e) =>
                      onSetDucking(
                        tunnel.id,
                        true,
                        Number(e.target.value) / 100,
                        tunnel.duckingRelease,
                      ),
                    onDoubleClick: () =>
                      onSetDucking(
                        tunnel.id,
                        true,
                        0.15,
                        tunnel.duckingRelease,
                      ),
                    title: "Duck amount (double-click to reset)",
                  }),
                  _jsxs("span", {
                    className: "duck-val",
                    children: [
                      tunnel.duckingAmount === 0
                        ? "−∞"
                        : `${(20 * Math.log10(tunnel.duckingAmount)).toFixed(0)}`,
                      " ",
                      "dB",
                    ],
                  }),
                  _jsx("input", {
                    className: "duck-slider duck-slider--release",
                    type: "range",
                    min: 50,
                    max: 5000,
                    step: 50,
                    value: tunnel.duckingRelease,
                    onChange: (e) =>
                      onSetDucking(
                        tunnel.id,
                        true,
                        tunnel.duckingAmount,
                        Number(e.target.value),
                      ),
                    title: "Release time",
                  }),
                  _jsxs("span", {
                    className: "duck-val",
                    children: [tunnel.duckingRelease, " ms"],
                  }),
                ],
              }),
          ],
        }),
      _jsx("div", {
        className: "vu-meter",
        children: _jsx("div", { className: "vu-bar", ref: vuBarRef }),
      }),
      _jsxs("div", {
        className: "card-foot",
        children: [
          _jsxs("button", {
            className: `cable-toggle${tunnel.active ? " is-active" : ""}`,
            onClick: () => onToggleActive(tunnel.id),
            disabled: !canActivate,
            title: !canActivate ? "Select input and output first" : undefined,
            children: [
              _jsx(Power, { size: 12, strokeWidth: 2.5 }),
              tunnel.active ? "Live" : "Offline",
            ],
          }),
          _jsx("button", {
            className: `cable-mute${tunnel.muted ? " is-muted" : ""}`,
            onClick: () => {
              if (tunnel.active) onToggleMute(tunnel.id);
            },
            disabled: !tunnel.active,
            title: !tunnel.active
              ? "Activate cable first"
              : tunnel.muted
                ? "Unmute"
                : "Mute",
            children: tunnel.muted
              ? _jsx(VolumeX, { size: 13, strokeWidth: 2 })
              : _jsx(Volume2, { size: 13, strokeWidth: 2 }),
          }),
        ],
      }),
    ],
  });
}
//# sourceMappingURL=TunnelCard.js.map
