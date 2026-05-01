import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { ExternalLink, Hexagon } from "lucide-react";
export default function VBInstallModal({
  open,
  onInstall,
  onOpenPage,
  onDismiss,
}) {
  if (!open) return null;
  return _jsx("div", {
    className: "modal-overlay",
    onClick: onDismiss,
    children: _jsxs("div", {
      className: "modal-box",
      onClick: (e) => e.stopPropagation(),
      children: [
        _jsx("div", {
          className: "modal-icon",
          children: _jsx(Hexagon, { size: 32, strokeWidth: 1.25 }),
        }),
        _jsx("h2", {
          className: "modal-title",
          children: "VB-Audio not detected",
        }),
        _jsx("p", {
          className: "modal-body",
          children:
            "VB-Audio Virtual Cable creates virtual audio devices visible to all apps \u2014 DAWs, browsers, streaming software. It's free and installs in under a minute.",
        }),
        _jsxs("p", {
          className: "modal-note",
          children: [
            _jsx("strong", { children: "Auto-install" }),
            " downloads the driver zip and launches the installer for you. A UAC prompt will appear to allow the kernel driver install. Restart this app once done.",
          ],
        }),
        _jsxs("div", {
          className: "modal-actions",
          children: [
            _jsx("button", {
              className: "btn-ghost",
              onClick: onDismiss,
              children: "Skip for now",
            }),
            _jsxs("button", {
              className: "btn-ghost",
              onClick: onOpenPage,
              children: [
                "Open page ",
                _jsx(ExternalLink, { size: 13, strokeWidth: 2 }),
              ],
            }),
            _jsx("button", {
              className: "btn-primary",
              onClick: onInstall,
              children: "Auto-install",
            }),
          ],
        }),
      ],
    }),
  });
}
//# sourceMappingURL=VBInstallModal.js.map
