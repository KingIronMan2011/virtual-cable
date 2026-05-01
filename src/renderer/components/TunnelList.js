import {
  jsx as _jsx,
  jsxs as _jsxs,
  Fragment as _Fragment,
} from "react/jsx-runtime";
import { useState } from "react";
import TunnelCard from "./TunnelCard";
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
}) {
  const [dragIndex, setDragIndex] = useState(null);
  const [overIndex, setOverIndex] = useState(null);
  if (tunnels.length === 0) {
    return _jsxs("div", {
      className: "empty-state",
      children: [
        _jsx("p", { className: "empty-heading", children: "No cables" }),
        _jsxs("p", {
          className: "empty-sub",
          children: [
            'Hit "+ New Cable" to patch your first',
            _jsx("br", {}),
            "audio tunnel.",
          ],
        }),
      ],
    });
  }
  return _jsx(_Fragment, {
    children: tunnels.map((tunnel, i) =>
      _jsx(
        "div",
        {
          draggable: true,
          onPointerDown: (e) => {
            // Disable draggable before the browser can start a drag gesture
            // on range inputs — otherwise the card reorders instead of sliding.
            if (e.target.closest('input[type="range"]')) {
              e.currentTarget.draggable = false;
            }
          },
          onPointerUp: (e) => {
            e.currentTarget.draggable = true;
          },
          onDragStart: (e) => {
            // Fallback guard for other interactive controls (select, button)
            const t = e.target;
            if (t.closest("select, input, button")) {
              e.preventDefault();
              return;
            }
            e.dataTransfer.effectAllowed = "move";
            setDragIndex(i);
          },
          onDragOver: (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            if (overIndex !== i) setOverIndex(i);
          },
          onDrop: (e) => {
            e.preventDefault();
            if (dragIndex !== null) onReorder(dragIndex, i);
            setDragIndex(null);
            setOverIndex(null);
          },
          onDragEnd: () => {
            setDragIndex(null);
            setOverIndex(null);
          },
          className: [
            "cable-drag-wrapper",
            dragIndex === i ? "is-dragging" : "",
            overIndex === i && dragIndex !== i ? "drag-over" : "",
          ]
            .filter(Boolean)
            .join(" "),
          children: _jsx(TunnelCard, {
            tunnel: tunnel,
            devices: devices,
            audioApps: audioApps,
            onUpdate: onUpdate,
            onToggleActive: onToggleActive,
            onToggleMute: onToggleMute,
            onSetGain: onSetGain,
            onSetInputGain: onSetInputGain,
            onSetInputPriority: onSetInputPriority,
            onSetDucking: onSetDucking,
            onRename: onRename,
            onDelete: onDelete,
            expSampleRate: expSampleRate,
          }),
        },
        tunnel.id,
      ),
    ),
  });
}
//# sourceMappingURL=TunnelList.js.map
