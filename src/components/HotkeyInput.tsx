import { useState, useEffect, useRef } from "react";
import { Keyboard, X } from "lucide-react";

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  placeholder?: string;
}

export default function HotkeyInput({
  value,
  onChange,
  label,
  placeholder = "None",
}: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isRecording) {
      btnRef.current?.focus();
    }
  }, [isRecording]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isRecording) return;

    e.preventDefault();
    e.stopPropagation();

    if (e.key === "Escape") {
      setIsRecording(false);
      return;
    }

    if (e.key === "Backspace" || e.key === "Delete") {
      onChange(null);
      setIsRecording(false);
      return;
    }

    // Ignore modifier-only presses
    if (["Control", "Shift", "Alt", "Meta"].includes(e.key)) return;

    const parts: string[] = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.shiftKey) parts.push("Shift");
    if (e.altKey) parts.push("Alt");
    if (e.metaKey) parts.push("Meta");

    // Normalize key name
    let key = e.key.toUpperCase();
    if (key === " ") key = "SPACE";
    if (key === "CONTROL") key = "CTRL";

    // Detect Numpad specifically using e.code
    if (e.nativeEvent.code.startsWith("Numpad")) {
      key = e.nativeEvent.code;
    }

    parts.push(key);

    onChange(parts.join("+"));
    setIsRecording(false);
  };

  return (
    <div className="hotkey-input-container">
      {label && <span className="hotkey-label">{label}</span>}
      <div className="hotkey-field-wrapper">
        <button
          ref={btnRef}
          className={`hotkey-record-btn${isRecording ? " is-recording" : ""}${!value ? " is-empty" : ""}`}
          onClick={() => setIsRecording(!isRecording)}
          onKeyDown={handleKeyDown}
          onBlur={() => setIsRecording(false)}
          title={
            isRecording
              ? "Press keys to assign, ESC to cancel, Backspace to clear"
              : "Click to assign hotkey"
          }
        >
          <Keyboard size={13} strokeWidth={2} />
          <span className="hotkey-value">
            {isRecording ? "Recording…" : value || placeholder}
          </span>
        </button>
        {value && !isRecording && (
          <button
            className="hotkey-clear"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            title="Clear hotkey"
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        )}
      </div>
    </div>
  );
}
