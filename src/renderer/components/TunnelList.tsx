import type { AudioDevice, Tunnel } from "../../types";
import TunnelCard from "./TunnelCard";

interface Props {
  tunnels: Tunnel[];
  devices: AudioDevice[];
  onUpdate: (tunnel: Tunnel) => void;
  onDelete: (id: string) => void;
  expSampleRate: boolean;
}

export default function TunnelList({
  tunnels,
  devices,
  onUpdate,
  onDelete,
  expSampleRate,
}: Props) {
  if (tunnels.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-heading">No cables</p>
        <p className="empty-sub">
          Hit "+ New Cable" to patch your first
          <br />
          audio tunnel.
        </p>
      </div>
    );
  }

  return (
    <>
      {tunnels.map((tunnel) => (
        <TunnelCard
          key={tunnel.id}
          tunnel={tunnel}
          devices={devices}
          onUpdate={onUpdate}
          onDelete={onDelete}
          expSampleRate={expSampleRate}
        />
      ))}
    </>
  );
}
