import { X } from "lucide-react";
import { useEffect, useRef } from "react";

export function Spinner({ label = "Loading" }) {
  return (
    <div className="state">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
export function Empty({ title, detail, action }) {
  return (
    <div className="empty">
      <div className="empty-mark">TS</div>
      <h2>{title}</h2>
      <p>{detail}</p>
      {action}
    </div>
  );
}
export function ErrorNotice({ error }) {
  return (
    <div className="notice error" role="alert">
      {error?.message || "Something went wrong. Please try again."}
    </div>
  );
}
export function Status({ value }) {
  return (
    <span className={`status status-${value.toLowerCase()}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function Modal({ title, open, onClose, children }) {
  const ref = useRef();
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onCancel={onClose}>
      <div className="modal-title">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Close">
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
