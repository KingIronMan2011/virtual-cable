import { useState } from "react";
import type { AudioDevice, Tunnel } from "../../types";
import TunnelCard from "./TunnelCard";

interface Props {
  tunnels: Tunnel[];
  devices: AudioDevice[];
  audioApps: { pid: number; name: string; exe: string }[];
  onUpdate: (tunnel: Tunnel) => void;
  onToggleActive: (id: string) => void;
  onToggleMute: (id: string) => void;
  onSetGain: (id: string, gain: number) => void;
  onSetInputGain: (id: string, inputIndex: number, gain: number) => void;
  onSetInputPriority: (id: string, inputIndex: number, priority: boolean) => void;
  onSetDucking: (id: string, enabled: boolean, amount: number, release: number) => void;
  onRename: (id: string, name: string) => void;
  onReorder: (from: number, to: number) => void;
  onDelete: (id: string) => void;
  expSampleRate: boolean;
}

export default function TunnelList({
  tunnels,
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
  onReorder,
  onDelete,
  expSampleRate,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

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
      {tunnels.map((tunnel, i) => (
        <div
          key={tunnel.id}
          draggable
          onDragStart={(e) => {
            // Don't hijack drags that originate from interactive controls
            const t = e.target as HTMLElement;
            if (t.closest("select, input, button")) {
              e.preventDefault();
              return;
            }
            e.dataTransfer.effectAllowed = "move";
            setDragIndex(i);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (overIndex !== i) setOverIndex(i);
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragIndex !== null) onReorder(dragIndex, i);
            setDragIndex(null);
            setOverIndex(null);
          }}
          onDragEnd={() => {
            setDragIndex(null);
            setOverIndex(null);
          }}
          className={[
            "cable-drag-wrapper",
            dragIndex === i ? "is-dragging" : "",
            overIndex === i && dragIndex !== i ? "drag-over" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <TunnelCard
            tunnel={tunnel}
            devices={devices}
            audioApps={audioApps}
            onUpdate={onUpdate}
            onToggleActive={onToggleActive}
            onToggleMute={onToggleMute}
            onSetGain={onSetGain}
            onSetInputGain={onSetInputGain}
            onSetInputPriority={onSetInputPriority}
            onSetDucking={onSetDucking}
            onRename={onRename}
            onDelete={onDelete}
            expSampleRate={expSampleRate}
          />
        </div>
      ))}
    </>
  );
}
