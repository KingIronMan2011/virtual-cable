import { useEffect, useRef, useState } from "react";
import type { AudioDevice, Tunnel } from "../../types";

interface Props {
  tunnel: Tunnel;
  devices: AudioDevice[];
  onUpdate: (tunnel: Tunnel) => void;
  onDelete: (id: string) => void;
  expSampleRate: boolean;
}

export default function TunnelCard({
  tunnel,
  devices,
  onUpdate,
  onDelete,
  expSampleRate,
}: Props) {
  const inputDevices = devices.filter((d) => d.maxInputChannels > 0);
  const outputDevices = devices.filter((d) => d.maxOutputChannels > 0);
  const canActivate =
    tunnel.inputDeviceId !== null && tunnel.outputDeviceId !== null;

  const vuBarRef = useRef<HTMLDivElement>(null);
  const [sampleRate, setSampleRate] = useState<number | null>(null);

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

  // Sample rate — fetched once when the tunnel goes active
  useEffect(() => {
    if (!tunnel.active || !expSampleRate) {
      setSampleRate(null);
      return;
    }
    window.electronAPI.getTunnelSampleRate(tunnel.id).then(setSampleRate);
  }, [tunnel.active, tunnel.id, expSampleRate]);

  const set = (patch: Partial<Tunnel>) => {
    const next = { ...tunnel, ...patch };
    if (
      patch.inputDeviceId !== undefined ||
      patch.outputDeviceId !== undefined
    ) {
      next.active = false;
    }
    onUpdate(next);
  };

  const toggleActive = () => {
    if (canActivate) onUpdate({ ...tunnel, active: !tunnel.active });
  };

  const toggleMute = () => {
    if (tunnel.active) onUpdate({ ...tunnel, muted: !tunnel.muted });
  };

  const srLabel =
    sampleRate !== null
      ? sampleRate >= 1000
        ? `${sampleRate / 1000} kHz`
        : `${sampleRate} Hz`
      : null;

  return (
    <div className={`cable-card${tunnel.active ? " is-active" : ""}`}>
      {/* Card header */}
      <div className="card-head">
        <span className="card-name">{tunnel.name}</span>
        <button
          className="card-delete"
          onClick={() => onDelete(tunnel.id)}
          title="Delete cable"
        >
          ✕
        </button>
      </div>

      {/* Routing row: input — cable — output */}
      <div className="routing-row">
        {/* Input */}
        <div className="device-group">
          <span className="device-label">Input</span>
          <select
            className="device-select"
            value={tunnel.inputDeviceId ?? ""}
            onChange={(e) =>
              set({
                inputDeviceId:
                  e.target.value !== "" ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">— select —</option>
            {inputDevices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {/* Animated cable */}
        <div className="cable-connector">
          <div className={`cable-jack${tunnel.active ? " is-active" : ""}`} />
          <div className={`cable-track${tunnel.active ? " is-active" : ""}`}>
            {tunnel.active && <div className="cable-pulse" />}
          </div>
          <div className={`cable-jack${tunnel.active ? " is-active" : ""}`} />
        </div>

        {/* Output */}
        <div className="device-group">
          <span className="device-label">Output</span>
          <select
            className="device-select"
            value={tunnel.outputDeviceId ?? ""}
            onChange={(e) =>
              set({
                outputDeviceId:
                  e.target.value !== "" ? Number(e.target.value) : null,
              })
            }
          >
            <option value="">— select —</option>
            {outputDevices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        {expSampleRate && (
          <span
            className="card-sample-rate"
            style={{ visibility: srLabel ? "visible" : "hidden" }}
          >
            {srLabel ?? "\u00A0"}
          </span>
        )}
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
          <span className="toggle-led" />
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
          {tunnel.muted ? "M" : "M"}
        </button>
      </div>
    </div>
  );
}
