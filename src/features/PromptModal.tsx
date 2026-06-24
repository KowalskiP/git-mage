import { useState } from "react";

interface Props {
  title: string;
  placeholder?: string;
  initial?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function PromptModal({ title, placeholder, initial, submitLabel, onSubmit, onCancel }: Props) {
  const [v, setV] = useState(initial ?? "");
  const ok = () => {
    if (v.trim()) onSubmit(v.trim());
  };
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <input
          className="modal-input"
          autoFocus
          value={v}
          placeholder={placeholder}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ok();
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="modal-actions">
          <button className="tbtn" onClick={onCancel}>
            Cancel
          </button>
          <button className="tbtn tbtn--primary" disabled={!v.trim()} onClick={ok}>
            {submitLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
