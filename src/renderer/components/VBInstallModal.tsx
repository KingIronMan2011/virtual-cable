interface Props {
  open: boolean;
  onInstall: () => void;
  onOpenPage: () => void;
  onDismiss: () => void;
}

export default function VBInstallModal({
  open,
  onInstall,
  onOpenPage,
  onDismiss,
}: Props) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onDismiss}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-icon">⬡</div>
        <h2 className="modal-title">VB-Audio not detected</h2>
        <p className="modal-body">
          VB-Audio Virtual Cable creates virtual audio devices visible to all
          apps — DAWs, browsers, streaming software. It's free and installs in
          under a minute.
        </p>
        <p className="modal-note">
          <strong>Auto-install</strong> downloads the driver zip and launches
          the installer for you. A UAC prompt will appear to allow the kernel
          driver install. Restart this app once done.
        </p>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onDismiss}>
            Skip for now
          </button>
          <button className="btn-ghost" onClick={onOpenPage}>
            Open page ↗
          </button>
          <button className="btn-primary" onClick={onInstall}>
            Auto-install
          </button>
        </div>
      </div>
    </div>
  );
}
