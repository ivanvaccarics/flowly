import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./icons.js";

/**
 * A dialog over the page, small enough to read rather than a component library:
 * Escape, the close button and a click on the backdrop all dismiss it, focus
 * starts inside and the caller hands it back to the control that opened it.
 */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // The key handler is bound once, so it reads the latest callback through a
  // ref: re-running it on every keystroke would steal focus back to the panel.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    panelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={panelRef}
      >
        <header>
          <h2>{title}</h2>
          <button type="button" className="btn small" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={14} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
