import type { AudioDevice, Tunnel } from "../../types";

interface Props {
  tunnel: Tunnel;
  devices: AudioDevice[];
  onUpdate: (tunnel: Tunnel) => void;
  onDelete: (id: string) => void;
}

export default function TunnelCard({
  tunnel,
  devices,
  onUpdate,
  onDelete,
}: Props) {
  const inputDevices = devices.filter((d) => d.maxInputChannels > 0);
  const outputDevices = devices.filter((d) => d.maxOutputChannels > 0);
  const canActivate =
    tunnel.inputDeviceId !== null && tunnel.outputDeviceId !== null;

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
      </div>
    </div>
  );
}
